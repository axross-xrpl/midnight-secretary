"use client";

/**
 * Browser-side client for the `age-verification` contract.
 *
 * Unlike token.ts / shielded-token.ts (which run server-side against a
 * seed the server holds), this contract's two circuits run on witness data
 * that must never leave the user's browser: an identity secret and a
 * date-of-birth commitment. So proving, balancing and submission all go
 * through the user's own wallet extension via the DApp Connector API, and
 * this module holds no seed at all -- the connector never exposes one.
 *
 * Everything here must stay client-safe: no `node:*` imports at module
 * scope, and the SDK (which pulls in WASM) is loaded lazily inside
 * `loadSdk()` so that merely importing this file does not initialize it.
 */

import type {
  ConnectedAPI,
  InitialAPI,
} from "@midnight-ntwrk/dapp-connector-api";
import type {
  ContractAddress,
  SigningKey,
} from "@midnight-ntwrk/compact-runtime";
import type { Contract as ContractNS } from "@midnight-ntwrk/compact-js";
import type { FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type {
  MidnightProvider,
  PrivateStateId,
  PrivateStateProvider,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  Contract as AgeVerificationContract,
  Witnesses,
} from "../../../contract/src/managed/age-verification/contract/index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Where `npm run copy-zk-config` puts age-verification's compiled prover /
 * verifier keys and zkIR, relative to the site root. FetchZkConfigProvider
 * appends `keys/<circuit>.prover` and `zkir/<circuit>.bzkir` to this.
 */
const ZK_CONFIG_BASE_PATH = "/zk-config/age-verification";

const PRIVATE_STATE_ID = "age-verification-private-state";

/** Namespaced so it cannot collide with anything else this app stores. */
const SECRET_STORAGE_KEY = "midnight-secretary:age-verification:secret:v1";
const DOB_STORAGE_KEY = "midnight-secretary:age-verification:dob:v1";

/**
 * Domain separators, byte-identical to the ones in
 * `contract/src/age-verification/witnesses.ts`. They must not drift: the
 * commitment written by `register()` is re-derived and compared by
 * `proveAdult()`.
 */
const IDENTITY_SECRET_DOMAIN =
  "midnight-secretary:age-verification:identity-secret:v1";
const DOB_SALT_DOMAIN = "midnight-secretary:age-verification:dob-salt:v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgeVerificationPrivateState = {
  readonly identitySecret: Uint8Array;
  readonly dobSalt: Uint8Array;
  /** YYYYMMDD, e.g. 19900215n -- matches the contract's `Uint<32>`. */
  readonly dateOfBirth: bigint;
};

type AgeVerificationContractType =
  AgeVerificationContract<AgeVerificationPrivateState>;

type AgeVerificationCircuitId =
  ContractNS.ProvableCircuitId<AgeVerificationContractType>;

export type TxOutcome = {
  readonly txId: string;
  readonly blockHeight: number;
};

export type ProveAdultOutcome = TxOutcome & {
  readonly isAdult: boolean;
};

export type WalletAddresses = {
  readonly shieldedAddress: string;
  readonly shieldedCoinPublicKey: string;
  readonly shieldedEncryptionPublicKey: string;
  readonly unshieldedAddress: string;
};

// ---------------------------------------------------------------------------
// Wallet detection / connection
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

/**
 * Wallets inject their Initial API under `window.midnight`, keyed by a UUID
 * rather than a fixed name, and one wallet may register several entries
 * (e.g. one per supported API version). So enumerate the values.
 */
export function detectWallets(): InitialAPI[] {
  if (typeof window === "undefined") return [];
  return Object.values(window.midnight ?? {});
}

/**
 * @param networkId The network to request, e.g. `"undeployed"` for a local
 *   devnet. The wallet may be on a different one -- this asks, and the
 *   returned connection is then verified against what the wallet reports.
 */
export async function connectWallet(
  wallet: InitialAPI,
  networkId: string,
): Promise<ConnectedAPI> {
  const api = await wallet.connect(networkId);
  const status = await api.getConnectionStatus();
  if (status.status !== "connected") {
    throw new Error("Wallet reported a disconnected state after connecting.");
  }
  if (status.networkId !== networkId) {
    throw new Error(
      `Wallet is connected to network "${status.networkId}", but this page expects "${networkId}".`,
    );
  }
  return api;
}

/** Thin display wrapper -- both calls are pure reads. */
export async function getShieldedAndUnshieldedAddresses(
  connectedApi: ConnectedAPI,
): Promise<WalletAddresses> {
  const [shielded, unshielded] = await Promise.all([
    connectedApi.getShieldedAddresses(),
    connectedApi.getUnshieldedAddress(),
  ]);
  return {
    shieldedAddress: shielded.shieldedAddress,
    shieldedCoinPublicKey: shielded.shieldedCoinPublicKey,
    shieldedEncryptionPublicKey: shielded.shieldedEncryptionPublicKey,
    unshieldedAddress: unshielded.unshieldedAddress,
  };
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------
//
// Deliberately hand-rolled rather than imported from
// @midnight-ntwrk/midnight-js-utils: that package's helpers go through
// `Buffer`, which only exists in the browser via a bundler polyfill.

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error("Expected an even-length hex string.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Local secret + witness derivation (Web Crypto)
// ---------------------------------------------------------------------------

/**
 * The CLI witnesses derive from a wallet seed. The connector deliberately
 * never exposes one, so the browser generates its own 32-byte secret once
 * and reuses it. Everything downstream is a pure function of this value, so
 * losing it (cleared site data, different browser/profile) means losing the
 * ability to prove against an existing registration -- there is no recovery
 * path, by design, because the secret is the identity.
 */
export function getOrCreateLocalSecretHex(): string {
  if (typeof window === "undefined") {
    throw new Error("The local age-verification secret is browser-only.");
  }
  const existing = window.localStorage.getItem(SECRET_STORAGE_KEY);
  if (existing) {
    // Guard against a truncated / hand-edited value silently producing a
    // different identity than the one already registered on-chain.
    fromHex(existing);
    return existing;
  }
  const fresh = new Uint8Array(32);
  crypto.getRandomValues(fresh);
  const hex = toHex(fresh);
  window.localStorage.setItem(SECRET_STORAGE_KEY, hex);
  return hex;
}

/**
 * SHA-256 over `utf8(domain) || bytes(seedHex)`.
 *
 * This mirrors the Node implementation's
 * `createHash("sha256").update(domain).update(seedBytes).digest()` exactly:
 * successive `update` calls concatenate, so a single digest over the
 * concatenation is the same value.
 */
async function deriveFromSeed(
  domain: string,
  userSeedHex: string,
): Promise<Uint8Array> {
  const domainBytes = new TextEncoder().encode(domain);
  const seedBytes = fromHex(userSeedHex);
  const input = new Uint8Array(domainBytes.length + seedBytes.length);
  input.set(domainBytes, 0);
  input.set(seedBytes, domainBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest);
}

/**
 * YYYYMMDD is validated here rather than in the circuit: a malformed date is
 * a UI mistake, and rejecting it locally costs no gates and leaks nothing.
 */
export function parseYyyymmdd(input: bigint | string, label: string): bigint {
  const text = typeof input === "bigint" ? input.toString() : input;
  if (!/^\d{8}$/.test(text)) {
    throw new Error(
      `${label} must be 8 digits in YYYYMMDD form (e.g. 19900215), got: ${text}`,
    );
  }
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    throw new Error(`${label} is not a real calendar date: ${text}`);
  }
  return BigInt(text);
}

async function createPrivateState(
  dateOfBirth: bigint,
): Promise<AgeVerificationPrivateState> {
  const seedHex = getOrCreateLocalSecretHex();
  const [identitySecret, dobSalt] = await Promise.all([
    deriveFromSeed(IDENTITY_SECRET_DOMAIN, seedHex),
    deriveFromSeed(DOB_SALT_DOMAIN, seedHex),
  ]);
  return { identitySecret, dobSalt, dateOfBirth };
}

const witnesses: Witnesses<AgeVerificationPrivateState> = {
  dateOfBirth: ({ privateState }) => [privateState, privateState.dateOfBirth],
  dobSalt: ({ privateState }) => [privateState, privateState.dobSalt],
  identitySecret: ({ privateState }) => [
    privateState,
    privateState.identitySecret,
  ],
};

// ---------------------------------------------------------------------------
// Remembered date of birth
// ---------------------------------------------------------------------------
//
// `proveAdult()` needs the same date of birth that `register()` committed to,
// because the circuit re-derives the commitment and compares it against the
// ledger. The CLI gets this from a persisted LevelDB private state; the
// browser equivalent is localStorage. It never leaves this origin -- which is
// the same boundary the contract already relies on for the identity secret.

/** @returns the DOB recorded at register time, or `null` if there is none. */
export function getRememberedDateOfBirth(): bigint | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(DOB_STORAGE_KEY);
  if (!stored) return null;
  try {
    return parseYyyymmdd(stored, "stored date of birth");
  } catch {
    return null;
  }
}

/** Forgets the local secret and remembered date of birth. */
export function clearLocalAgeVerificationState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SECRET_STORAGE_KEY);
  window.localStorage.removeItem(DOB_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Lazy SDK loading
// ---------------------------------------------------------------------------

async function loadSdk() {
  const [
    contractModule,
    compactJs,
    contracts,
    ledger,
    networkIdModule,
    fetchZkConfig,
    proofProviderModule,
    indexerModule,
  ] = await Promise.all([
    import("../../../contract/src/managed/age-verification/contract/index.js"),
    import("@midnight-ntwrk/compact-js"),
    import("@midnight-ntwrk/midnight-js-contracts"),
    import("@midnight-ntwrk/ledger-v8"),
    import("@midnight-ntwrk/midnight-js-network-id"),
    import("@midnight-ntwrk/midnight-js-fetch-zk-config-provider"),
    import("@midnight-ntwrk/midnight-js-dapp-connector-proof-provider"),
    import("@midnight-ntwrk/midnight-js-indexer-public-data-provider"),
  ]);
  return {
    Contract: contractModule.Contract,
    CompiledContract: compactJs.CompiledContract,
    findDeployedContract: contracts.findDeployedContract,
    Transaction: ledger.Transaction,
    CostModel: ledger.CostModel,
    setNetworkId: networkIdModule.setNetworkId,
    FetchZkConfigProvider: fetchZkConfig.FetchZkConfigProvider,
    dappConnectorProofProvider: proofProviderModule.dappConnectorProofProvider,
    indexerPublicDataProvider: indexerModule.indexerPublicDataProvider,
  };
}

type Sdk = Awaited<ReturnType<typeof loadSdk>>;

let sdkPromise: Promise<Sdk> | null = null;

function sdk(): Promise<Sdk> {
  sdkPromise ??= loadSdk();
  return sdkPromise;
}

// ---------------------------------------------------------------------------
// Connector <-> midnight-js bridge
// ---------------------------------------------------------------------------

/**
 * midnight-js's `WalletProvider`/`MidnightProvider` pass typed ledger
 * `Transaction` objects; the DApp Connector passes strings. The connector's
 * string is the **lowercase hex encoding of `Transaction.serialize()`**, with
 * no `0x` prefix. That is not stated in
 * `@midnight-ntwrk/dapp-connector-api`'s own types or README -- it was
 * established from both sides of the wire:
 *
 *  - producer: Lace's connector implementation returns
 *    `Buffer.from(finalizedTx.serialize()).toString('hex')` and decodes
 *    incoming transactions with `Buffer.from(tx, 'hex')`
 *    (input-output-hk/lace,
 *    packages/module/dapp-connector-midnight/.../midnight-dapp-connector-api.ts).
 *  - consumer: midnight-js's own connector adapter decodes with `fromHex(tx)`
 *    (midnightntwrk/midnight-js,
 *    testkit-js/.../wallet/dapp-connector-wallet-adapter.ts).
 *
 * The branded type markers are plain string literals, taken from the
 * `instance` fields declared on the marker classes in the installed
 * `@midnight-ntwrk/ledger-v8/ledger-v8.d.ts`: `'signature'`, `'proof'`,
 * `'binding'`, `'pre-binding'`. Note the hyphen -- it is `'pre-binding'`,
 * not `'preBinding'`.
 *
 * Direction of travel, matching the connector's documented types:
 *   balanceUnsealedTransaction: in  Transaction<SignatureEnabled, Proof, PreBinding>
 *                               out Transaction<SignatureEnabled, Proof, Binding>
 *   submitTransaction:          in  Transaction<SignatureEnabled, Proof, Binding>
 */
function createConnectorWalletProvider(
  connectedApi: ConnectedAPI,
  shieldedCoinPublicKey: string,
  shieldedEncryptionPublicKey: string,
  Transaction: Sdk["Transaction"],
): WalletProvider & MidnightProvider {
  return {
    // midnight-js normalizes Bech32m or hex here (parseCoinPublicKeyToHex),
    // so the connector's Bech32m form is passed through as-is.
    getCoinPublicKey: () => shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shieldedEncryptionPublicKey,

    async balanceTx(tx) {
      // `ttl` is intentionally dropped: the connector exposes no TTL knob,
      // and the wallet applies its own.
      const { tx: balancedHex } = await connectedApi.balanceUnsealedTransaction(
        toHex(tx.serialize()),
      );
      return Transaction.deserialize(
        "signature",
        "proof",
        "binding",
        fromHex(balancedHex),
      );
    },

    async submitTx(tx) {
      // The connector returns void, so the transaction id is read off the
      // transaction we submitted rather than from the wallet's response.
      const identifiers = tx.identifiers();
      const txId = identifiers[0];
      if (!txId) {
        throw new Error("Balanced transaction carried no transaction id.");
      }
      await connectedApi.submitTransaction(toHex(tx.serialize()));
      return txId;
    },
  };
}

/**
 * midnight-js ships LevelDB- and file-backed private state providers, both
 * Node-only. Here the private state is a pure function of the localStorage
 * secret and the supplied date of birth, so it is rebuilt on every call and
 * needs no durable store.
 */
function createMemoryPrivateStateProvider<PS>(): PrivateStateProvider<
  PrivateStateId,
  PS
> {
  const states = new Map<string, PS>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let scope: ContractAddress | null = null;

  const key = (privateStateId: PrivateStateId) => {
    if (scope === null) {
      throw new Error(
        "setContractAddress must be called before reading or writing private state.",
      );
    }
    return `${scope}:${privateStateId}`;
  };

  const unsupported = (name: string): never => {
    throw new Error(
      `${name} is not supported by the in-memory private state provider.`,
    );
  };

  return {
    setContractAddress(address) {
      scope = address;
    },
    async set(privateStateId, state) {
      states.set(key(privateStateId), state);
    },
    async get(privateStateId) {
      return states.get(key(privateStateId)) ?? null;
    },
    async remove(privateStateId) {
      states.delete(key(privateStateId));
    },
    async clear() {
      states.clear();
    },
    async setSigningKey(address, signingKey) {
      signingKeys.set(address, signingKey);
    },
    async getSigningKey(address) {
      return signingKeys.get(address) ?? null;
    },
    async removeSigningKey(address) {
      signingKeys.delete(address);
    },
    async clearSigningKeys() {
      signingKeys.clear();
    },
    exportPrivateStates: () => unsupported("exportPrivateStates"),
    importPrivateStates: () => unsupported("importPrivateStates"),
    exportSigningKeys: () => unsupported("exportSigningKeys"),
    importSigningKeys: () => unsupported("importSigningKeys"),
  };
}

// ---------------------------------------------------------------------------
// Contract wiring
// ---------------------------------------------------------------------------

function requireContractAddress(): string {
  const address = process.env.NEXT_PUBLIC_AGE_VERIFICATION_ADDRESS;
  if (!address) {
    throw new Error(
      "Missing NEXT_PUBLIC_AGE_VERIFICATION_ADDRESS -- set it to the deployed age-verification contract address.",
    );
  }
  return address;
}

function zkConfigBaseUrl(): string {
  if (typeof window === "undefined") {
    throw new Error("The age-verification client is browser-only.");
  }
  // FetchZkConfigProvider rejects anything that is not an absolute http(s)
  // URL, so the site origin is prepended to the public asset path.
  return new URL(ZK_CONFIG_BASE_PATH, window.location.origin).toString();
}

async function withAgeVerificationContract<T>(
  connectedApi: ConnectedAPI,
  dateOfBirth: bigint,
  use: (contract: FoundContract<AgeVerificationContractType>) => Promise<T>,
): Promise<T> {
  const {
    Contract,
    CompiledContract,
    findDeployedContract,
    Transaction,
    CostModel,
    setNetworkId,
    FetchZkConfigProvider,
    dappConnectorProofProvider,
    indexerPublicDataProvider,
  } = await sdk();

  // Give the wallet a chance to gather any permissions it needs up front,
  // rather than interrupting mid-flow between proving and submission. Typed
  // as always present on ConnectedAPI, but not every real wallet extension
  // implements it -- best-effort only, never block the actual flow on it.
  if (typeof connectedApi.hintUsage === "function") {
    await connectedApi.hintUsage([
      "getShieldedAddresses",
      "getProvingProvider",
      "balanceUnsealedTransaction",
      "submitTransaction",
    ]);
  }

  // Use the wallet's own service endpoints: the user may have picked them
  // for privacy or performance reasons, and the connector docs ask DApps to
  // prefer them over hard-coded ones.
  const configuration = await connectedApi.getConfiguration();
  setNetworkId(configuration.networkId);

  const shielded = await connectedApi.getShieldedAddresses();

  // FetchZkConfigProvider defaults fetchFunc to cross-fetch's `fetch` export
  // and calls it as `this.fetchFunc(...)` -- a method call, so `this` inside
  // that function is the provider instance, not `window`. The browser's
  // native fetch needs `this === window` internally and throws "Illegal
  // invocation" otherwise. Passing the browser's own fetch explicitly, bound
  // to window, sidesteps cross-fetch's broken default.
  const zkConfigProvider = new FetchZkConfigProvider<AgeVerificationCircuitId>(
    zkConfigBaseUrl(),
    window.fetch.bind(window),
  );

  const walletAndMidnightProvider = createConnectorWalletProvider(
    connectedApi,
    shielded.shieldedCoinPublicKey,
    shielded.shieldedEncryptionPublicKey,
    Transaction,
  );

  const providers = {
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
    publicDataProvider: indexerPublicDataProvider(
      configuration.indexerUri,
      configuration.indexerWsUri,
    ),
    privateStateProvider:
      createMemoryPrivateStateProvider<AgeVerificationPrivateState>(),
    zkConfigProvider,
    // Proving happens inside the wallet: the witness data never crosses the
    // extension boundary, which is the entire point of this contract.
    proofProvider: await dappConnectorProofProvider(
      connectedApi,
      zkConfigProvider,
      CostModel.initialCostModel(),
    ),
  };

  const compiledContract = CompiledContract.make(
    "age-verification",
    Contract<AgeVerificationPrivateState>,
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    // Never dereferenced on this path -- the ZK artifacts come from
    // `zkConfigProvider` above. It is supplied only to complete the
    // CompiledContract's required context.
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_BASE_PATH),
  );

  const contract = await findDeployedContract(providers, {
    contractAddress: requireContractAddress(),
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: await createPrivateState(dateOfBirth),
  });

  return use(contract);
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/**
 * Calls `register()`, committing to the caller's date of birth under their
 * locally-held identity secret.
 *
 * The contract refuses re-registration, so calling this twice for the same
 * local secret fails on-chain with "Identity already registered".
 *
 * @param dateOfBirthYYYYMMDD e.g. `19900215n`. Never transmitted: it is
 *   consumed by a witness inside the wallet's prover, and only the resulting
 *   salted commitment reaches the ledger.
 */
export async function registerAge(
  connectedApi: ConnectedAPI,
  dateOfBirthYYYYMMDD: bigint,
): Promise<TxOutcome> {
  const dateOfBirth = parseYyyymmdd(dateOfBirthYYYYMMDD, "date of birth");

  const outcome = await withAgeVerificationContract(
    connectedApi,
    dateOfBirth,
    async (contract) => {
      const result = await contract.callTx.register();
      return {
        txId: result.public.txId,
        blockHeight: result.public.blockHeight,
      };
    },
  );

  // Recorded only after the transaction lands, so a failed registration does
  // not leave a date of birth behind claiming otherwise.
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DOB_STORAGE_KEY, dateOfBirth.toString());
  }
  return outcome;
}

/**
 * Calls `proveAdult(cutoffDate)` and returns the circuit's answer.
 *
 * The answer is returned rather than asserted, so a "no" is an observable
 * result instead of an aborted transaction indistinguishable from a network
 * failure.
 *
 * @param cutoffDateYYYYMMDD The verifier's number, not the prover's -- for a
 *   20-year rule it is today minus 20 years.
 * @param dateOfBirthYYYYMMDD Optional. Defaults to the date recorded when
 *   `registerAge` last succeeded in this browser. It must match what was
 *   registered: the circuit re-derives the commitment and compares.
 */
export async function proveAdult(
  connectedApi: ConnectedAPI,
  cutoffDateYYYYMMDD: bigint,
  dateOfBirthYYYYMMDD?: bigint,
): Promise<ProveAdultOutcome> {
  const cutoffDate = parseYyyymmdd(cutoffDateYYYYMMDD, "cutoff date");
  const remembered = dateOfBirthYYYYMMDD ?? getRememberedDateOfBirth();
  if (remembered === null) {
    throw new Error(
      "No date of birth available. Register first in this browser, or pass one explicitly.",
    );
  }
  const dateOfBirth = parseYyyymmdd(remembered, "date of birth");

  return withAgeVerificationContract(
    connectedApi,
    dateOfBirth,
    async (contract) => {
      const result = await contract.callTx.proveAdult(cutoffDate);
      return {
        isAdult: result.private.result,
        txId: result.public.txId,
        blockHeight: result.public.blockHeight,
      };
    },
  );
}
