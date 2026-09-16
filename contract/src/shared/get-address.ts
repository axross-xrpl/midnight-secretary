import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
} from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { InMemoryTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { syncWallet } from "./sync.js";
import { readWalletCache, installShutdownHandler } from "./wallet-cache.js";

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

// Usage: node --env-file=.env --import tsx src/shared/get-address.ts [seedHex]
// Defaults to DEPLOYER_SEED from .env if no argument is given.
const SEED_HEX = process.argv[2] ?? requireEnv("DEPLOYER_SEED");

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
  setNetworkId(NETWORK_ID);
  const networkId = getNetworkId();

  const keys = deriveKeys(SEED_HEX);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

  // Shared with sync.ts and the deploy scripts: same (networkId, seedHex)
  // key means whichever of them last ran leaves this seed's sync progress
  // for the next one, instead of each replaying from genesis separately.
  const cache = readWalletCache(NETWORK_ID, SEED_HEX);
  console.log(
    cache
      ? "Found a saved sync cache -- resuming instead of replaying from genesis."
      : "No saved sync cache -- this will replay from genesis.",
  );

  console.log("Initializing wallet...");
  const facade = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection: {
        indexerHttpUrl: INDEXER_HTTP,
        indexerWsUrl: INDEXER_WS,
      },
      provingServerUrl: new URL(PROOF_SERVER),
      relayURL: new URL(NODE_URL),
      costParameters: { feeBlocksMargin: 5 },
      txHistoryStorage: new InMemoryTransactionHistoryStorage(
        WalletEntrySchema,
      ),
      // Default batch size (10) makes shielded/dust's replay of a long
      // preview/preprod history very slow -- see
      // https://github.com/midnightntwrk/midnight-wallet/issues/425.
      batchUpdates: { size: 5000 },
    },
    shielded: (cfg) =>
      cache?.shielded
        ? ShieldedWallet(cfg).restore(cache.shielded)
        : ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      cache?.unshielded
        ? UnshieldedWallet(cfg).restore(cache.unshielded)
        : UnshieldedWallet(cfg).startWithPublicKey(
            PublicKey.fromKeyStore(keystore),
          ),
    dust: (cfg) =>
      cache?.dust
        ? DustWallet(cfg).restore(cache.dust)
        : DustWallet(cfg).startWithSecretKey(
            dustSecretKey,
            ledger.LedgerParameters.initialParameters().dust,
          ),
  });

  const cleanup = installShutdownHandler(NETWORK_ID, SEED_HEX, facade);

  try {
    await facade.start(shieldedSecretKeys, dustSecretKey);
    console.log("Syncing (this is fast on local devnet)...");
    const state = await syncWallet(console, facade, 2_000);

    const unshieldedAddress = MidnightBech32m.encode(
      networkId,
      state.unshielded.address,
    ).asString();
    const shieldedAddress = MidnightBech32m.encode(
      networkId,
      state.shielded.address,
    ).asString();

    console.log("\n=== Wallet addresses for this seed ===");
    console.log(`Unshielded (Night) address: ${unshieldedAddress}`);
    console.log(`Shielded address:           ${shieldedAddress}`);
    console.log(
      `Shielded coin public key:   ${state.shielded.coinPublicKey.toHexString()}`,
    );
    console.log(
      `Unshielded NIGHT balance:    ${state.unshielded.balances[ledger.nativeToken().raw] ?? 0n}`,
    );
    console.log(
      `Shielded NIGHT balance:      ${state.shielded.balances[ledger.nativeToken().raw] ?? 0n}`,
    );
    console.log(
      `DUST balance:                ${state.dust.balance(new Date())}`,
    );
    const registeredCount = state.unshielded.availableCoins.filter(
      (c) => c.meta.registeredForDustGeneration,
    ).length;
    console.log(
      `NIGHT UTXOs registered for DUST: ${registeredCount} / ${state.unshielded.availableCoins.length}`,
    );
  } finally {
    console.log("Saving sync cache...");
    await cleanup();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
