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
  type FacadeState,
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
import { fileURLToPath } from "node:url";
import { readWalletCache, installShutdownHandler } from "./wallet-cache.js";

/**
 * Minimal logger shape -- `console` satisfies this directly, so using
 * syncWallet doesn't need a logging dependency.
 */
export type Logger = {
  info: (message: string) => void;
  debug: (message: string) => void;
};

// Every sub-wallet's SyncProgress (shielded, unshielded, dust) exposes this
// method despite tracking progress with different fields internally --
// index-based for shielded/dust, transaction-id-based for unshielded. See
// wallet-sdk-{shielded,dust-wallet}/dist/*/SyncProgress.d.ts vs
// wallet-sdk-unshielded-wallet/dist/v1/SyncProgress.d.ts.
function isProgressStrictlyComplete(progress: {
  isStrictlyComplete(): boolean;
}): boolean {
  return progress.isStrictlyComplete();
}

// appliedIndex/highestIndex are the only numbers shielded/dust's SyncProgress
// exposes -- there is no ready-made percentage, and highestIndex can be 0n
// before the wallet has heard from the indexer at all.
function indexProgressLine(
  label: string,
  progress: {
    appliedIndex: bigint;
    highestIndex: bigint;
    isConnected: boolean;
  },
) {
  const pct =
    progress.highestIndex === 0n
      ? "?"
      : (
          (Number(progress.appliedIndex) / Number(progress.highestIndex)) *
          100
        ).toFixed(1);
  return `${label}: ${progress.appliedIndex}/${progress.highestIndex} (${pct}%) connected=${progress.isConnected}`;
}

// The unshielded wallet tracks progress by transaction id instead, with its
// own (differently shaped) SyncProgress type.
function idProgressLine(
  label: string,
  progress: {
    appliedId: bigint;
    highestTransactionId: bigint;
    isConnected: boolean;
  },
) {
  const pct =
    progress.highestTransactionId === 0n
      ? "?"
      : (
          (Number(progress.appliedId) / Number(progress.highestTransactionId)) *
          100
        ).toFixed(1);
  return `${label}: ${progress.appliedId}/${progress.highestTransactionId} (${pct}%) connected=${progress.isConnected}`;
}

/**
 * Which sub-wallets must strictly finish syncing before syncWallet resolves.
 * All three by default. Set one to `false` to proceed without it -- e.g.
 * `{ shielded: false, dust: false }` to only require unshielded, because
 * shielded/dust's replay is what stalls on preview/preprod (see
 * https://github.com/midnightntwrk/midnight-wallet/issues/425).
 *
 * This does NOT make the skipped sub-wallet's balance trustworthy: DUST
 * pays fees, so a transaction that needs fees can still fail with an
 * insufficient-funds error if dust hasn't caught up enough yet -- skipping
 * the wait only stops the caller waiting for a completeness signal that may
 * never arrive, it doesn't make the underlying balance correct.
 */
export type SyncRequirement = {
  shielded?: boolean;
  unshielded?: boolean;
  dust?: boolean;
};

/**
 * Waits for the required sub-wallets (shielded, unshielded, dust -- all
 * three unless `require` says otherwise) to strictly finish syncing.
 * Progress for all three is always logged, at most once per `throttleTime`.
 * No timeout -- preview/preprod's shielded/dust replay can legitimately run
 * for many minutes at a time under
 * https://github.com/midnightntwrk/midnight-wallet/issues/425, and giving
 * up partway just discards progress that saveWalletCache would otherwise
 * have kept for next time. This does mean a genuinely dead connection
 * (isConnected staying false, no further state emissions at all) now hangs
 * the process rather than failing -- Ctrl+C to stop it; a plain SIGINT
 * kills Node before the `finally` block's saveWalletCache call can run, so
 * that run's progress isn't persisted.
 */
export const syncWallet = (
  logger: Logger,
  wallet: WalletFacade,
  throttleTime = 2_000,
  require: SyncRequirement = {},
): Promise<FacadeState> => {
  const requireShielded = require.shielded ?? true;
  const requireUnshielded = require.unshielded ?? true;
  const requireDust = require.dust ?? true;

  logger.info("Syncing wallet...");
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.tap((state: FacadeState) => {
        const shieldedSynced = isProgressStrictlyComplete(
          state.shielded.progress,
        );
        const unshieldedSynced = isProgressStrictlyComplete(
          state.unshielded.progress,
        );
        const dustSynced = isProgressStrictlyComplete(state.dust.progress);
        logger.debug(
          [
            `Sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`,
            indexProgressLine("shielded  ", state.shielded.progress),
            idProgressLine("unshielded", state.unshielded.progress),
            indexProgressLine("dust      ", state.dust.progress),
          ].join(" | "),
        );
      }),
      Rx.throttleTime(throttleTime),
      Rx.filter(
        (state: FacadeState) =>
          (!requireShielded ||
            isProgressStrictlyComplete(state.shielded.progress)) &&
          (!requireDust || isProgressStrictlyComplete(state.dust.progress)) &&
          (!requireUnshielded ||
            isProgressStrictlyComplete(state.unshielded.progress)),
      ),
      Rx.tap(() => logger.info("Sync complete")),
    ),
  );
};

/**
 * Usage: node --env-file=.env --import tsx src/shared/sync.ts
 * Times how long DEPLOYER_SEED's wallet takes to sync against whatever
 * network contract/.env currently points at.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  return value;
}

const NETWORK_ID = requireEnv("NETWORK_ID");
const INDEXER_HTTP = requireEnv("INDEXER_HTTP");
const INDEXER_WS = requireEnv("INDEXER_WS");
const NODE_URL = requireEnv("NODE_URL");
const PROOF_SERVER = requireEnv("PROOF_SERVER");
const DEPLOYER_SEED = requireEnv("DEPLOYER_SEED");

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

async function main() {
  console.log(`Setting up network (${NETWORK_ID})...`);
  setNetworkId(NETWORK_ID);
  const networkId = getNetworkId();

  console.log("Deriving wallet keys from DEPLOYER_SEED...");
  const keys = deriveKeys(DEPLOYER_SEED);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

  const cache = readWalletCache(NETWORK_ID, DEPLOYER_SEED);
  console.log(
    cache
      ? "Found a saved sync cache -- resuming instead of replaying from genesis."
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
      // Default batch size (10) is what made shielded/dust's replay of a
      // long preview/preprod history this slow to begin with -- see
      // https://github.com/midnightntwrk/midnight-wallet/issues/425.
      // Not a complete fix on every chain (some report it still eventually
      // fails on a "poison" event cluster), but confirmed to help.
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
      cache?.dust
        ? DustWallet(cfg).restore(cache.dust)
        : DustWallet(cfg).startWithSecretKey(
            dustSecretKey,
            ledger.LedgerParameters.initialParameters().dust,
          ),
  });

  const startedAt = performance.now();
  const logger: Logger = { info: console.log, debug: console.log };
  // Ctrl+C during a long preview/preprod sync now saves progress instead of
  // losing it -- see wallet-cache.ts's comment on why this needs its own
  // signal handler rather than relying on the `finally` block below.
  const cleanup = installShutdownHandler(NETWORK_ID, DEPLOYER_SEED, facade);

  try {
    console.log("Starting wallet facade (connecting to node and indexer)...");
    await facade.start(shieldedSecretKeys, dustSecretKey);

    await syncWallet(logger, facade, 2_000);

    const elapsedSec = ((performance.now() - startedAt) / 1000).toFixed(1);
    const state = await facade.waitForSyncedState();
    console.log(`\nSynced in ${elapsedSec}s.`);
    console.log("  Unshielded (Night) balances:", state.unshielded.balances);
    console.log("  Shielded balances:          ", state.shielded.balances);
  } finally {
    // Saved even on a failed sync above -- serializeState() reflects
    // whatever was actually replayed, so the next run resumes further
    // ahead instead of starting from genesis again.
    console.log("Saving sync cache...");
    await cleanup();
  }
}

// Only run as a script (not when imported for `syncWallet`/`Logger`, which
// deploy scripts and get-address.ts do) -- otherwise importing this module
// would connect and sync a second, unwanted wallet facade as a side effect.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
}
