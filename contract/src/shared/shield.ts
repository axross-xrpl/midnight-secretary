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
  type CombinedSwapOutputs,
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
import { readWalletCache, installShutdownHandler } from "./wallet-cache.js";
import { syncWallet } from "./sync.js";

/**
 * Converts some of DEPLOYER_SEED's own unshielded NIGHT into shielded NIGHT
 * -- a self-conversion (initSwap with a shielded output addressed to this
 * same wallet's own shielded address), not a transfer to anyone else. This
 * is what fund-shielded.ts's genesis-wallet-funds-a-recipient pattern
 * can't do off local devnet: there is no pre-funded genesis seed on
 * preview/preprod, so getting shielded NIGHT there means shielding NIGHT
 * you already hold, not receiving it from one.
 *
 * Usage: node --env-file=.env --import tsx src/shared/shield.ts <nightAmount>
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

const [AMOUNT_STR] = process.argv.slice(2);
if (!AMOUNT_STR) {
  console.error("Usage: npm run shield -- <nightAmount>");
  process.exit(1);
}
const AMOUNT_NIGHT = BigInt(AMOUNT_STR) * 1_000_000n; // 6 decimal places, matching fund-shielded.ts

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

  // Only shielded is safe to resume from cache here -- this script only
  // ever READS from it (state.shielded.address, the swap's own
  // destination), never spends from it. Unshielded and dust both always
  // cold-start: unshielded is what this script actually SPENDS from to
  // fund the swap, and a restored wallet's UTXO set isn't guaranteed to
  // exactly match the current chain state (this is what caused a real
  // "InvariantViolation" (node error 199) submission failure -- the swap
  // was built against unshielded UTXOs from a stale cache). Dust cold-starts
  // for the same never-restore-what-you-spend-from reason -- see
  // wallet-cache.ts's comment on why a restored dust wallet doesn't
  // reconstruct real per-coin generation data at all.
  const cache = readWalletCache(NETWORK_ID, DEPLOYER_SEED);
  console.log(
    cache
      ? "Found a saved sync cache -- resuming shielded from it (unshielded/dust always sync fresh, since this script spends from both)."
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
      // additionalFeeOverhead keeps the fee non-zero so the spend isn't
      // rejected as NotNormalized (error 117) -- needed because this wallet
      // SPENDS, same as fund-shielded.ts.
      costParameters: {
        additionalFeeOverhead: 300_000_000_000_000n,
        feeBlocksMargin: 5,
      },
      provingServerUrl: new URL(PROOF_SERVER),
      relayURL: new URL(NODE_URL),
      txHistoryStorage: new InMemoryTransactionHistoryStorage(
        WalletEntrySchema,
      ),
      // Default batch size (10) makes shielded's replay of a long
      // preview/preprod history very slow -- see
      // https://github.com/midnightntwrk/midnight-wallet/issues/425.
      batchUpdates: { size: 10000 },
    },
    shielded: (cfg) =>
      cache?.shielded
        ? ShieldedWallet(cfg).restore(cache.shielded)
        : ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
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

  const cleanup = installShutdownHandler(NETWORK_ID, DEPLOYER_SEED, facade);

  try {
    console.log("Starting wallet facade (connecting to node and indexer)...");
    await facade.start(shieldedSecretKeys, dustSecretKey);

    console.log("Waiting for wallet to sync...");
    const state = await syncWallet(console, facade, 2_000);
    console.log("Wallet synced!");

    const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
    const unshieldedBalance = state.unshielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    console.log(`Unshielded NIGHT balance: ${unshieldedBalance}`);
    if (unshieldedBalance < AMOUNT_NIGHT) {
      throw new Error(
        `Unshielded balance (${unshieldedBalance}) is less than requested amount (${AMOUNT_NIGHT})`,
      );
    }

    const desiredOutputs: CombinedSwapOutputs[] = [
      {
        type: "shielded",
        outputs: [
          {
            type: NIGHT_TOKEN_TYPE,
            receiverAddress: state.shielded.address,
            amount: AMOUNT_NIGHT,
          },
        ],
      },
    ];

    console.log(
      `\nShielding ${AMOUNT_STR} NIGHT (own wallet: unshielded -> shielded)...`,
    );
    // initSwap + finalizeRecipe alone is a deliberately ONE-SIDED, unbalanced
    // transaction -- an "offer" -- per the official docs' two-party swap
    // example (static/midnight-wallet/snippets/swap.ts): Alice's initSwap
    // gives up token1 and claims token2 she doesn't have yet, and it's
    // BOB calling balanceFinalizedTransaction on Alice's tx that actually
    // completes and value-balances it before submitting. Submitting the
    // one-sided half directly (as this script first did) gets rejected by
    // the node with "InvariantViolation" (error 199) -- the NIGHT supply
    // implied by the transaction doesn't conserve, because it isn't
    // balanced yet. For a SELF-conversion there's no separate counterparty:
    // this same wallet has to play Bob's role against its own offer too.
    // payFees is deliberately false here, unlike every other script in this
    // repo -- this wallet has exactly one DUST coin (confirmed earlier this
    // session), and initSwap's own fee-payment (true by default) would
    // reserve it as pending before balanceFinalizedTransaction below gets a
    // chance to use it for its own fee settlement, throwing "Insufficient
    // Funds: could not balance dust" against a wallet that plainly has
    // DUST. The official Alice/Bob swap example never needs this: each side
    // is a separate wallet paying from its own separate DUST pool once, not
    // the same wallet paying itself twice from a single coin.
    const offer = await facade.initSwap(
      { unshielded: { [NIGHT_TOKEN_TYPE]: AMOUNT_NIGHT } },
      desiredOutputs,
      { shieldedSecretKeys, dustSecretKey },
      { ttl: new Date(Date.now() + 60 * 60 * 1000), payFees: false },
    );
    const signedOffer = await facade.signRecipe(offer, (p) =>
      keystore.signData(p),
    );
    const finalizedOffer = await facade.finalizeRecipe(signedOffer);

    const balanced = await facade.balanceFinalizedTransaction(
      finalizedOffer,
      { shieldedSecretKeys, dustSecretKey },
      { ttl: new Date(Date.now() + 60 * 60 * 1000) },
    );
    // Defensive: the docs' Bob-side balancing step doesn't re-sign before
    // its second finalizeRecipe, but that example never touches unshielded.
    // signRecipe has no documented no-op guarantee, but every other script
    // in this repo (fund-shielded.ts, deploy.ts, etc.) always calls it right
    // before finalizeRecipe regardless of what changed, and none of them
    // has ever failed because of it -- kept here on that same precedent,
    // in case balancing pulled in more unshielded inputs to cover fees.
    const signedBalanced = await facade.signRecipe(balanced, (p) =>
      keystore.signData(p),
    );
    const finalized = await facade.finalizeRecipe(signedBalanced);
    const txId = await facade.submitTransaction(finalized);
    console.log(`Done! TX: ${txId}`);
  } finally {
    console.log("Saving sync cache...");
    await cleanup();
  }
}

main().catch((err) => {
  console.error("Shielding failed:", err);
  process.exit(1);
});
