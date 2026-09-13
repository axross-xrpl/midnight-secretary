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
    },
    shielded: (cfg) =>
      ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        PublicKey.fromKeyStore(keystore),
      ),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  try {
    await facade.start(shieldedSecretKeys, dustSecretKey);
    console.log("Syncing (this is fast on local devnet)...");
    const state = await facade.waitForSyncedState();

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
    await facade.stop();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
