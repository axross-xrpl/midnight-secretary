import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
  type UtxoWithMeta,
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
import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";

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

// Usage: node --env-file=.env --import tsx src/shared/register-dust.ts [seedHex]
// Defaults to DEPLOYER_SEED from .env if no argument is given.
const SEED_HEX = process.argv[2] ?? requireEnv("DEPLOYER_SEED");
const BALANCE_WAIT_MS = 120_000;

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
      // additionalFeeOverhead needed here because THIS wallet spends (signs the
      // registration tx), unlike a wallet that only ever receives.
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
    console.log("Syncing...");
    const state = await facade.waitForSyncedState();

    const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
    const nightUtxos: readonly UtxoWithMeta[] =
      state.unshielded.availableCoins.filter(
        (coin) =>
          coin.utxo.type === NIGHT_TOKEN_TYPE &&
          coin.meta.registeredForDustGeneration === false,
      );
    console.log(`NIGHT UTXOs to register: ${nightUtxos.length}`);
    if (nightUtxos.length === 0) {
      console.log(
        "Nothing to register (either no NIGHT UTXOs, or all already registered).",
      );
      return;
    }

    const recipe = await facade.registerNightUtxosForDustGeneration(
      nightUtxos,
      keystore.getPublicKey(),
      (p) => keystore.signData(p),
    );
    const txId = await facade.submitTransaction(
      await facade.finalizeRecipe(recipe),
    );
    console.log(`DUST registration TX: ${txId}`);

    console.log("Waiting for DUST balance > 0 (this takes a few blocks)...");
    try {
      const dustState = await Rx.firstValueFrom(
        facade.state().pipe(
          Rx.filter((s) => s.dust.balance(new Date()) > 0n),
          Rx.timeout(BALANCE_WAIT_MS),
        ),
      );
      console.log(`DUST balance: ${dustState.dust.balance(new Date())}`);
    } catch {
      console.log(
        "DUST balance still 0 after timeout -- it accrues over time as more blocks are produced. Re-run `npm run address` in a bit to check.",
      );
    }
  } finally {
    await facade.stop();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
