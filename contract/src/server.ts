import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import {
  findDeployedContract,
  withContractScopedTransaction,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  CompiledContract,
  type Contract as ContractNS,
} from "@midnight-ntwrk/compact-js";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
} from "@midnight-ntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { InMemoryTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import {
  MidnightBech32m,
  UnshieldedAddress,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import { bech32m } from "@scure/base";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import type {
  WalletProvider,
  MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { syncWallet } from "./shared/sync.js";
import { readWalletCache, saveWalletCache } from "./shared/wallet-cache.js";

import { Contract as TokenContract } from "./managed/token/contract/index.js";
import {
  witnesses as tokenWitnesses,
  createTokenPrivateState,
  deriveOwnerSecretKey,
} from "./token/witnesses.js";
import { Contract as ShieldedTokenContract } from "./managed/shielded-token/contract/index.js";
import {
  witnesses as shieldedTokenWitnesses,
  createShieldedTokenPrivateState,
  deriveMinterSecret,
} from "./shielded-token/witnesses.js";
import {
  Contract as AgeVerificationContract,
  ledger as ageVerificationLedger,
  pureCircuits as ageVerificationPureCircuits,
} from "./managed/age-verification/contract/index.js";
import {
  witnesses as ageVerificationWitnesses,
  createAgeVerificationPrivateState,
  deriveIdentitySecret,
  deriveDobSalt,
} from "./age-verification/witnesses.js";

/**
 * Long-lived faucet/settlement backend for /dev/contracts and the mandate
 * real adapter. Unlike the one-shot CLI scripts (interact.ts, get-state.ts,
 * ...), this keeps a single WalletFacade synced and connected to the
 * deployed contracts for as long as the process runs, so the multi-minute
 * wallet-sync cost is paid once at startup instead of on every request.
 * root's Next.js app talks to this over HTTP (see src/lib/dev-contracts/
 * network.ts) instead of spawning a subprocess per call. Started alongside
 * `npm run dev` at the repo root via `concurrently` (see root package.json +
 * scripts/start-contract-server.mjs).
 *
 * token/shielded-token share one deployer/owner account, so every callTx
 * call across every route below is serialized through a single queue --
 * running two concurrently races for that account's next on-chain nonce and
 * one submission gets rejected by the node.
 *
 * age-verification/* is different in kind, not just another owner-gated
 * contract: register()/proveAdult() have no owner role at all (see
 * age-verification.compact) and the DEPLOYER_SEED wallet here only pays
 * fees, on behalf of whichever accountRef the caller names. accountRef is an
 * opaque per-user pseudonym (see identityIds.identityOf in
 * src/adapters/runtime.ts) that deterministically derives that user's own
 * identitySecret/dobSalt (see age-verification/witnesses.ts) and partitions
 * their private state in the local LevelDB store, so many distinct users can
 * register/prove against the one deployment this server is connected to.
 * This is still a stand-in, not the real shape: the date of birth and the
 * derived identity secret both pass through this server (over loopback
 * HTTP, from the app's real identity adapter) instead of staying on the
 * traveler's own device -- the real version proves from a connected wallet.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return value;
}

const NETWORK_ID = requireEnv("NETWORK_ID");
const INDEXER_HTTP = requireEnv("INDEXER_HTTP");
const INDEXER_WS = requireEnv("INDEXER_WS");
const NODE_URL = requireEnv("NODE_URL");
const PROOF_SERVER = requireEnv("PROOF_SERVER");
const DEPLOYER_SEED = requireEnv("DEPLOYER_SEED");
const TOKEN_ADDRESS = requireEnv("TOKEN_ADDRESS");
// Optional: the settlement path (MandatePort's real adapter) only uses the
// unshielded token's sendToken, so a server that just needs to serve /token/*
// shouldn't have to deploy and configure the unrelated shielded-token contract too.
const SHIELDED_TOKEN_ADDRESS = process.env.SHIELDED_TOKEN_ADDRESS;
// Optional, same reasoning as SHIELDED_TOKEN_ADDRESS above.
const AGE_VERIFICATION_ADDRESS = process.env.AGE_VERIFICATION_ADDRESS;
const PORT = Number(process.env.CONTRACT_SERVER_PORT ?? 4900);

type TokenCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof TokenContract>
>;
type ShieldedTokenCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof ShieldedTokenContract>
>;
type AgeVerificationCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof AgeVerificationContract>
>;

// Modest fixed amount for a test faucet -- this is a dev tool, not a real
// distribution mechanism.
const FAUCET_AMOUNT = 1000n;

function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") throw new Error("Invalid seed");
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== "keysDerived") throw new Error("Key derivation failed");
  hdWallet.hdWallet.clear();
  return {
    zswap: result.keys[Roles.Zswap],
    nightExternal: result.keys[Roles.NightExternal],
    dust: result.keys[Roles.Dust],
  };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(Buffer.from(clean, "hex"));
}

// See interact-shielded-token.ts for why this bypasses MidnightBech32m.parse's
// built-in length check (a shielded address is longer than @scure/base's
// default 90-char cap).
function parseBech32mUnbounded(str: string): MidnightBech32m {
  const { prefix, bytes } = bech32m.decodeToBytes(str, false);
  const [mnPrefix, type, network = "mainnet"] = prefix.split("_");
  if (mnPrefix !== MidnightBech32m.prefix) {
    throw new Error(`Expected prefix ${MidnightBech32m.prefix}`);
  }
  return new MidnightBech32m(type, network, Buffer.from(bytes));
}

type ResolvedRecipient = {
  coinPublicKey: Uint8Array;
  // Only known when `arg` was a full shielded address -- a bare hex coin
  // public key carries no encryption key, so mint_and_send will only work
  // for such a recipient if the wallet's own zswap state already has a
  // mapping for them (see additionalCoinEncPublicKeyMappings below).
  encryptionPublicKeyHex?: string;
};

function resolveRecipient(arg: string, networkId: string): ResolvedRecipient {
  if (arg.startsWith(`${MidnightBech32m.prefix}_shield-addr_`)) {
    const address = parseBech32mUnbounded(arg).decode(
      ShieldedAddress,
      networkId,
    );
    return {
      coinPublicKey: new Uint8Array(address.coinPublicKey.data),
      encryptionPublicKeyHex: address.encryptionPublicKeyString(),
    };
  }
  return { coinPublicKey: hexToBytes(arg) };
}

// Every route below acts as the same deployer account, so serialize all of
// them behind one queue regardless of which contract they touch.
let queue: Promise<void> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function main() {
  console.log("Setting up network...");
  setNetworkId(NETWORK_ID);
  const networkId = getNetworkId();

  console.log("Deriving wallet keys...");
  const keys = deriveKeys(DEPLOYER_SEED);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

  // Shared with contract/'s CLI scripts (sync.ts, get-address.ts, deploy.ts,
  // ...): same (networkId, seedHex) key means a server restart resumes
  // shielded/unshielded from wherever a CLI run (or a previous server run)
  // already got to, instead of replaying preview/preprod history from
  // genesis every single startup. Dust always cold-starts regardless -- a
  // restored dust wallet never reconstructs its real per-coin generation
  // data (see wallet-cache.ts's comment), and this server pays DUST fees on
  // every owner-gated call.
  const cache = readWalletCache(NETWORK_ID, DEPLOYER_SEED);
  console.log(
    cache
      ? "Found a saved sync cache -- resuming shielded/unshielded from it (dust always syncs fresh)."
      : "No saved sync cache -- this will replay from genesis.",
  );

  console.log("Initializing wallet facade...");
  const facade = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection: {
        indexerHttpUrl: INDEXER_HTTP,
        indexerWsUrl: INDEXER_WS,
      },
      provingServerUrl: new URL(PROOF_SERVER),
      relayURL: new URL(NODE_URL),
      costParameters: {
        additionalFeeOverhead: 300_000_000_000_000n,
        feeBlocksMargin: 5,
      },
      txHistoryStorage: new InMemoryTransactionHistoryStorage(
        WalletEntrySchema,
      ),
      // Default batch size (10) makes shielded/dust's replay of a long
      // preview/preprod history very slow -- see
      // https://github.com/midnightntwrk/midnight-wallet/issues/425.
      batchUpdates: { size: 10000 },
    },
    shielded: (cfg) =>
      cache?.shielded
        ? ShieldedWallet(cfg).restore(cache.shielded)
        : ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => {
      const unshieldedCfg = {
        ...cfg,
        txHistoryStorage: new InMemoryTransactionHistoryStorage(
          WalletEntrySchema,
        ),
      };
      return cache?.unshielded
        ? UnshieldedWallet(unshieldedCfg).restore(cache.unshielded)
        : UnshieldedWallet(unshieldedCfg).startWithPublicKey(
            PublicKey.fromKeyStore(keystore),
          );
    },
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  // Registered here, before the slow sync below, rather than at the bottom
  // after the HTTP server is listening -- otherwise Ctrl+C during startup
  // sync (the exact scenario that used to hang on a fixed timeout) would
  // hit Node's default SIGINT behavior and lose that sync progress instead
  // of saving it. `server` doesn't exist yet at this point, hence the
  // conditional close below.
  let server: http.Server | undefined;
  const shutdown = async () => {
    console.log("Shutting down contract server...");
    server?.close();
    console.log("Saving sync cache...");
    await saveWalletCache(NETWORK_ID, DEPLOYER_SEED, facade);
    await facade.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("Starting wallet facade...");
  await facade.start(shieldedSecretKeys, dustSecretKey);

  console.log(
    "Waiting for wallet to sync (this is the slow part, paid once at startup unless a sync cache already exists)...",
  );
  const state = await syncWallet(console, facade, 2_000);
  console.log("Wallet synced!");

  const walletAndMidnightProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () =>
      state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const recipe = await facade.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        {
          ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ["unshielded", "dust"],
        },
      );
      return await facade.finalizeRecipe(recipe);
    },
    submitTx: (tx) => facade.submitTransaction(tx),
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const tokenZkConfigPath = path.resolve(__dirname, "managed/token");
  const tokenZkConfigProvider = new NodeZkConfigProvider<TokenCircuitId>(
    tokenZkConfigPath,
  );
  const tokenProviders = {
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "token-private-state",
      privateStoragePasswordProvider: () => "Token-Dev-Pa55word!",
      accountId: "deployer",
    }),
    zkConfigProvider: tokenZkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER, tokenZkConfigProvider),
  };
  const tokenCompiledContract = CompiledContract.make(
    "token",
    TokenContract,
  ).pipe(
    CompiledContract.withWitnesses(tokenWitnesses),
    CompiledContract.withCompiledFileAssets(tokenZkConfigPath),
  );

  console.log(`Finding deployed token contract at ${TOKEN_ADDRESS}...`);
  const ownerSecretKey = deriveOwnerSecretKey(DEPLOYER_SEED);
  const tokenContract = await findDeployedContract(tokenProviders, {
    contractAddress: TOKEN_ADDRESS,
    compiledContract: tokenCompiledContract,
    privateStateId: "token-private-state",
    initialPrivateState: createTokenPrivateState(ownerSecretKey),
  });
  console.log("Token contract found!");

  // Optional: only set up when SHIELDED_TOKEN_ADDRESS is configured, so a
  // server that just needs /token/* (the settlement path) can start without
  // deploying or configuring the unrelated shielded-token contract. A
  // function (rather than hand-written types) keeps the provider/contract
  // types inferred.
  async function setUpShielded(shieldedTokenAddress: string | undefined) {
    if (!shieldedTokenAddress) {
      console.log(
        "SHIELDED_TOKEN_ADDRESS not set -- skipping shielded-token (only /token/* routes will work)",
      );
      return undefined;
    }

    const shieldedZkConfigPath = path.resolve(
      __dirname,
      "managed/shielded-token",
    );
    const shieldedZkConfigProvider =
      new NodeZkConfigProvider<ShieldedTokenCircuitId>(shieldedZkConfigPath);
    const shieldedProviders = {
      walletProvider: walletAndMidnightProvider,
      midnightProvider: walletAndMidnightProvider,
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: "shielded-token-private-state",
        privateStoragePasswordProvider: () => "ShieldedToken-Dev-Pa55word!",
        accountId: "deployer",
      }),
      zkConfigProvider: shieldedZkConfigProvider,
      proofProvider: httpClientProofProvider(
        PROOF_SERVER,
        shieldedZkConfigProvider,
      ),
    };
    const shieldedCompiledContract = CompiledContract.make(
      "shielded-token",
      ShieldedTokenContract,
    ).pipe(
      CompiledContract.withWitnesses(shieldedTokenWitnesses),
      CompiledContract.withCompiledFileAssets(shieldedZkConfigPath),
    );

    console.log(
      `Finding deployed shielded-token contract at ${shieldedTokenAddress}...`,
    );
    const shieldedContract = await findDeployedContract(shieldedProviders, {
      contractAddress: shieldedTokenAddress,
      compiledContract: shieldedCompiledContract,
      privateStateId: "shielded-token-private-state",
      initialPrivateState: createShieldedTokenPrivateState(
        deriveMinterSecret(DEPLOYER_SEED),
      ),
    });
    console.log("Shielded-token contract found!");

    return { shieldedContract, shieldedProviders };
  }

  const shielded = await setUpShielded(SHIELDED_TOKEN_ADDRESS);

  // Optional, same reasoning as setUpShielded above. Unlike token/
  // shielded-token, register()/proveAdult() have no owner role (see
  // age-verification.compact), so what's shared across every accountRef
  // here is only the network-facing half: the DEPLOYER_SEED wallet (pays
  // fees, same as every other route in this file), the indexer, the proof
  // server and the compiled contract. The private-state half -- identity
  // secret, DOB salt, and the LevelDB partition they live in -- is specific
  // to each accountRef, so connectAgeVerification (below) builds that part
  // fresh per call instead of once here.
  function setUpAgeVerification(ageVerificationAddress: string | undefined) {
    if (!ageVerificationAddress) {
      console.log(
        "AGE_VERIFICATION_ADDRESS not set -- skipping age-verification",
      );
      return undefined;
    }

    const ageVerificationZkConfigPath = path.resolve(
      __dirname,
      "managed/age-verification",
    );
    const ageVerificationZkConfigProvider =
      new NodeZkConfigProvider<AgeVerificationCircuitId>(
        ageVerificationZkConfigPath,
      );
    const ageVerificationCompiledContract = CompiledContract.make(
      "age-verification",
      AgeVerificationContract,
    ).pipe(
      CompiledContract.withWitnesses(ageVerificationWitnesses),
      CompiledContract.withCompiledFileAssets(ageVerificationZkConfigPath),
    );

    return {
      ageVerificationAddress,
      ageVerificationCompiledContract,
      sharedProviders: {
        walletProvider: walletAndMidnightProvider,
        midnightProvider: walletAndMidnightProvider,
        publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
        zkConfigProvider: ageVerificationZkConfigProvider,
        proofProvider: httpClientProofProvider(
          PROOF_SERVER,
          ageVerificationZkConfigProvider,
        ),
      },
    };
  }

  const ageVerification = setUpAgeVerification(AGE_VERIFICATION_ADDRESS);

  // accountRef is an opaque per-user pseudonym the app derives once per
  // userId (see identityIds.identityOf in src/adapters/runtime.ts) and
  // passes on every register/prove call. It doubles as: (1) the LevelDB
  // accountId that partitions this user's private state from every other
  // accountRef's in the one shared store, and (2) the input this server
  // derives identitySecret/dobSalt from, standing in for a per-user wallet
  // seed (see age-verification/witnesses.ts -- deriveIdentitySecret/
  // deriveDobSalt hash whatever hex string they're given, seed or not).
  //
  // Pass `dateOfBirth` only when registering for the first time -- it seeds
  // this accountRef's private state. Omit it (as prove does) to reconnect
  // against whatever was stored by that earlier register call instead:
  // findDeployedContract OVERWRITES stored private state whenever
  // `initialPrivateState` is given, even on a call that isn't deploying, so
  // proveAdult must never pass a guessed-at DOB here -- that would blow away
  // the real one before the circuit ever sees it.
  async function connectAgeVerification(
    accountRef: string,
    dateOfBirth?: bigint,
  ) {
    if (!ageVerification) {
      throw new Error("age-verification is not configured");
    }
    const {
      ageVerificationAddress,
      ageVerificationCompiledContract,
      sharedProviders,
    } = ageVerification;
    const identitySecret = deriveIdentitySecret(accountRef);
    const dobSalt = deriveDobSalt(accountRef);
    const providers = {
      ...sharedProviders,
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: "age-verification-private-state",
        privateStoragePasswordProvider: () => "AgeVerification-Dev-Pa55word!",
        accountId: accountRef,
      }),
    };

    return findDeployedContract(providers, {
      contractAddress: ageVerificationAddress,
      compiledContract: ageVerificationCompiledContract,
      privateStateId: "age-verification-private-state",
      ...(dateOfBirth === undefined
        ? {}
        : {
            initialPrivateState: createAgeVerificationPrivateState(
              identitySecret,
              dobSalt,
              dateOfBirth,
            ),
          }),
    });
  }

  // The on-chain pseudonym (age-verification.compact's deriveIdentity(sk)),
  // hex-encoded for JSON -- not accountRef itself. accountRef never appears
  // on chain; this is the Map key every register()/proveAdult() call
  // discloses, so it's what a caller can actually look up in the indexer.
  function ageVerificationIdentityHex(accountRef: string): string {
    return Buffer.from(
      ageVerificationPureCircuits.deriveIdentity(
        deriveIdentitySecret(accountRef),
      ),
    ).toString("hex");
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/token/state") {
      const result = await serialize(async () => {
        // One transaction instead of four -- see token.compact's
        // getTokenInfo for why that matters here.
        const info = (await tokenContract.callTx.getTokenInfo()).private.result;
        return {
          name: info.name,
          symbol: info.symbol,
          tokenColor: Buffer.from(info.tokenColor).toString("hex"),
          sendAllowanceRemaining: info.sendAllowance.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/token/request") {
      const body = await readJsonBody(req);
      const recipientUnshieldedAddress = String(
        body.recipientUnshieldedAddress ?? "",
      );
      if (!recipientUnshieldedAddress) {
        return sendJson(res, 400, {
          error: "Missing recipientUnshieldedAddress",
        });
      }
      const result = await serialize(async () => {
        const recipientAddress = MidnightBech32m.parse(
          recipientUnshieldedAddress,
        ).decode(UnshieldedAddress, networkId);
        const recipient = {
          is_left: false,
          left: { bytes: new Uint8Array(32) },
          right: { bytes: new Uint8Array(recipientAddress.data) },
        };
        const txResult = await tokenContract.callTx.sendToken(
          recipient,
          FAUCET_AMOUNT,
        );
        return {
          blockHeight: txResult.public.blockHeight,
          amount: FAUCET_AMOUNT.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/token/pay") {
      const body = await readJsonBody(req);
      const recipientUnshieldedAddress = String(
        body.recipientUnshieldedAddress ?? "",
      );
      const amountArg = String(body.amount ?? "");
      if (!recipientUnshieldedAddress || !amountArg) {
        return sendJson(res, 400, {
          error: "Missing recipientUnshieldedAddress or amount",
        });
      }
      let amount: bigint;
      try {
        amount = BigInt(amountArg);
      } catch {
        return sendJson(res, 400, { error: "amount must be an integer" });
      }
      const result = await serialize(async () => {
        const recipientAddress = MidnightBech32m.parse(
          recipientUnshieldedAddress,
        ).decode(UnshieldedAddress, networkId);
        const recipient = {
          is_left: false,
          left: { bytes: new Uint8Array(32) },
          right: { bytes: new Uint8Array(recipientAddress.data) },
        };
        const txResult = await tokenContract.callTx.sendToken(
          recipient,
          amount,
        );
        return {
          blockHeight: txResult.public.blockHeight,
          txId: txResult.public.txId,
          amount: amount.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/shielded-token/state") {
      if (!shielded) {
        return sendJson(res, 503, {
          error:
            "Shielded-token is not configured (set SHIELDED_TOKEN_ADDRESS)",
        });
      }
      const { shieldedContract } = shielded;
      const result = await serialize(async () => {
        // One transaction instead of three -- see shielded-token.compact's
        // getShieldedTokenInfo for why that matters here.
        const info = (await shieldedContract.callTx.getShieldedTokenInfo())
          .private.result;
        return {
          mintCount: info.mintCount.toString(),
          initialized: info.initialized,
          mintAllowanceRemaining: info.mintAllowance.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/shielded-token/request") {
      if (!shielded) {
        return sendJson(res, 503, {
          error:
            "Shielded-token is not configured (set SHIELDED_TOKEN_ADDRESS)",
        });
      }
      const { shieldedContract, shieldedProviders } = shielded;
      const body = await readJsonBody(req);
      const recipientArg = String(body.recipient ?? "");
      if (!recipientArg) {
        return sendJson(res, 400, { error: "Missing recipient" });
      }
      const result = await serialize(async () => {
        const resolved = resolveRecipient(recipientArg, networkId);
        const recipient = { bytes: resolved.coinPublicKey };
        // mint_and_send creates a coin output for `recipient`, who isn't
        // the server's own wallet -- the SDK refuses to build that output
        // ("Unable to resolve encryption public key for recipient ...")
        // unless it's told which EncPublicKey to encrypt it to. That mapping
        // is scoped per-transaction via withContractScopedTransaction, not
        // passed directly to callTx.
        const additionalCoinEncPublicKeyMappings =
          resolved.encryptionPublicKeyHex
            ? new Map([
                [
                  Buffer.from(resolved.coinPublicKey).toString("hex"),
                  resolved.encryptionPublicKeyHex,
                ],
              ])
            : undefined;
        const finalized = await withContractScopedTransaction(
          shieldedProviders,
          async (txCtx) => {
            await shieldedContract.callTx.mint_and_send(
              txCtx,
              recipient,
              FAUCET_AMOUNT,
              0n,
            );
          },
          { additionalCoinEncPublicKeyMappings },
        );
        return {
          blockHeight: finalized.public.blockHeight,
          amount: FAUCET_AMOUNT.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/shielded-token/pay") {
      if (!shielded) {
        return sendJson(res, 503, {
          error:
            "Shielded-token is not configured (set SHIELDED_TOKEN_ADDRESS)",
        });
      }
      const { shieldedContract, shieldedProviders } = shielded;
      const body = await readJsonBody(req);
      const recipientArg = String(body.recipient ?? "");
      const amountArg = String(body.amount ?? "");
      if (!recipientArg || !amountArg) {
        return sendJson(res, 400, {
          error: "Missing recipient or amount",
        });
      }
      let amount: bigint;
      try {
        amount = BigInt(amountArg);
      } catch {
        return sendJson(res, 400, { error: "amount must be an integer" });
      }
      const result = await serialize(async () => {
        const resolved = resolveRecipient(recipientArg, networkId);
        const recipient = { bytes: resolved.coinPublicKey };
        // See /shielded-token/request above for why this mapping is needed.
        const additionalCoinEncPublicKeyMappings =
          resolved.encryptionPublicKeyHex
            ? new Map([
                [
                  Buffer.from(resolved.coinPublicKey).toString("hex"),
                  resolved.encryptionPublicKeyHex,
                ],
              ])
            : undefined;
        const finalized = await withContractScopedTransaction(
          shieldedProviders,
          async (txCtx) => {
            await shieldedContract.callTx.mint_and_send(
              txCtx,
              recipient,
              amount,
              0n,
            );
          },
          { additionalCoinEncPublicKeyMappings },
        );
        return {
          blockHeight: finalized.public.blockHeight,
          txId: finalized.public.txId,
          amount: amount.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (
      req.method === "GET" &&
      url.pathname === "/age-verification/registration"
    ) {
      if (!ageVerification) {
        return sendJson(res, 503, {
          error:
            "age-verification is not configured (set AGE_VERIFICATION_ADDRESS)",
        });
      }
      const accountRef = url.searchParams.get("accountRef") ?? "";
      if (!accountRef) {
        return sendJson(res, 400, { error: "Missing accountRef" });
      }
      const { ageVerificationAddress, sharedProviders } = ageVerification;
      // A plain ledger read, no proving or private state involved -- safe to
      // do outside serialize() (nothing here touches the wallet's nonce).
      const state = await sharedProviders.publicDataProvider.queryContractState(
        ageVerificationAddress,
      );
      if (!state) {
        return sendJson(res, 503, {
          error: "age-verification contract state is unavailable",
        });
      }
      const identityBytes = ageVerificationPureCircuits.deriveIdentity(
        deriveIdentitySecret(accountRef),
      );
      const { registrations } = ageVerificationLedger(state.data);
      const registered = registrations.member(identityBytes);
      return sendJson(res, 200, {
        identity: ageVerificationIdentityHex(accountRef),
        registered,
        ...(registered
          ? {
              dobCommitment: Buffer.from(
                registrations.lookup(identityBytes),
              ).toString("hex"),
            }
          : {}),
        contractAddress: ageVerificationAddress,
      });
    }

    if (
      req.method === "POST" &&
      url.pathname === "/age-verification/register"
    ) {
      if (!ageVerification) {
        return sendJson(res, 503, {
          error:
            "age-verification is not configured (set AGE_VERIFICATION_ADDRESS)",
        });
      }
      const body = await readJsonBody(req);
      const accountRef = String(body.accountRef ?? "");
      const dobStr = String(body.dateOfBirth ?? "");
      if (!accountRef) {
        return sendJson(res, 400, { error: "Missing accountRef" });
      }
      if (!/^\d{8}$/.test(dobStr)) {
        return sendJson(res, 400, {
          error: "dateOfBirth must be an 8-digit YYYYMMDD value",
        });
      }
      const result = await serialize(async () => {
        const contract = await connectAgeVerification(
          accountRef,
          BigInt(dobStr),
        );
        // Fails with "Identity already registered" if this accountRef
        // already registered against this deployment.
        const txResult = await contract.callTx.register();
        return {
          identity: ageVerificationIdentityHex(accountRef),
          txId: txResult.public.txId,
          blockHeight: txResult.public.blockHeight,
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/age-verification/prove") {
      if (!ageVerification) {
        return sendJson(res, 503, {
          error:
            "age-verification is not configured (set AGE_VERIFICATION_ADDRESS)",
        });
      }
      const body = await readJsonBody(req);
      const accountRef = String(body.accountRef ?? "");
      const cutoffStr = String(body.cutoffDate ?? "");
      if (!accountRef) {
        return sendJson(res, 400, { error: "Missing accountRef" });
      }
      if (!/^\d{8}$/.test(cutoffStr)) {
        return sendJson(res, 400, {
          error: "cutoffDate must be an 8-digit YYYYMMDD value",
        });
      }
      const result = await serialize(async () => {
        // No dateOfBirth here -- reconnects against whatever register()
        // already stored for this accountRef (see connectAgeVerification's
        // comment on why passing one here would overwrite it with a guess).
        const contract = await connectAgeVerification(accountRef).catch(
          (cause) => {
            // This accountRef has never registered against this server's
            // private-state store -- report it the same way the circuit's
            // own assertion would, so real.ts's error mapping still applies.
            if (
              cause instanceof Error &&
              cause.message.includes("No private state found")
            ) {
              throw new Error("Identity not registered");
            }
            throw cause;
          },
        );
        // Fails with "Identity not registered" if this accountRef hasn't
        // called /age-verification/register yet.
        const txResult = await contract.callTx.proveAdult(BigInt(cutoffStr));
        return {
          identity: ageVerificationIdentityHex(accountRef),
          txId: txResult.public.txId,
          blockHeight: txResult.public.blockHeight,
          cutoffDate: cutoffStr,
          isAdult: txResult.private.result,
        };
      });
      return sendJson(res, 200, result);
    }

    sendJson(res, 404, { error: "Not found" });
  }

  server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("Request failed:", err);
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Contract server listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Contract server failed to start:", err);
  process.exit(1);
});
