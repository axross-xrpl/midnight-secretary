import "server-only";
import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
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
import * as ledger from "@midnight-ntwrk/ledger-v8";
import * as Rx from "rxjs";
import type {
  WalletProvider,
  MidnightProvider,
  PrivateStateId,
  PrivateStateProvider,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  ContractAddress,
  SigningKey,
} from "@midnight-ntwrk/compact-runtime";

// Ported from contract/src/token/deploy.ts's already-verified pattern -- this
// is the /dev/contracts faucet backend's own copy (not imported cross-package)
// since it needs to run inside Next.js's server runtime, not tsx/WSL.

export function requireEnv(name: string): string {
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

export { INDEXER_HTTP, INDEXER_WS, PROOF_SERVER };

function deriveKeys(seedHex: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seedHex, "hex"));
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

/**
 * levelPrivateStateProvider pulls in `classic-level`, a native LevelDB
 * binding with no prebuilt binary for this machine's Node/Windows
 * combination ("No native build was found for platform=win32 ... abi=137").
 * Unnecessary here anyway: the faucet's private state (the owner's secret)
 * is fully re-derived from DEPLOYER_SEED on every call (see token.ts /
 * shielded-token.ts), so nothing needs to survive between requests, let
 * alone process restarts.
 */
export function createMemoryPrivateStateProvider<PS>(): PrivateStateProvider<
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

export type WalletHandle = {
  networkId: string;
  walletProvider: WalletProvider & MidnightProvider;
};

// Inits, syncs, and tears down a WalletFacade for exactly one request's
// duration -- no cross-request caching (see plan: accept per-call sync
// latency, matches what the CLI scripts already do).
export async function withWallet<T>(
  seedHex: string,
  fn: (handle: WalletHandle) => Promise<T>,
): Promise<T> {
  setNetworkId(NETWORK_ID);
  const networkId = getNetworkId();

  const keys = deriveKeys(seedHex);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

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
    },
    shielded: (cfg) =>
      ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet({
        ...cfg,
        txHistoryStorage: new InMemoryTransactionHistoryStorage(
          WalletEntrySchema,
        ),
      }).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  try {
    await facade.start(shieldedSecretKeys, dustSecretKey);
    const state = await Rx.firstValueFrom(
      facade.state().pipe(
        Rx.filter((s) => s.isSynced),
        Rx.timeout(120_000),
      ),
    );

    const walletProvider: WalletProvider & MidnightProvider = {
      getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
      getEncryptionPublicKey: () =>
        state.shielded.encryptionPublicKey.toHexString(),
      async balanceTx(tx, ttl) {
        const recipe = await facade.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys, dustSecretKey },
          { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
        );
        return await facade.finalizeRecipe(recipe);
      },
      submitTx: (tx) => facade.submitTransaction(tx),
    };

    return await fn({ networkId, walletProvider });
  } finally {
    await facade.stop();
  }
}
