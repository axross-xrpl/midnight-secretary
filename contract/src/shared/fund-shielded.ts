import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
  type CombinedTokenTransfer,
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
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { bech32m } from "@scure/base";

// Workaround for a bug in @midnight-ntwrk/wallet-sdk-address-format@3.1.2:
// MidnightBech32m.parse() calls bech32m.decodeToBytes() with no explicit
// limit, so it inherits @scure/base's default 90-character cap -- too short
// for a shielded address (135 chars, since it encodes both a coin key and an
// encryption key). No newer stable release fixes this yet. This replicates
// parse()'s own logic but disables the length check (limit: false).
function parseBech32mUnbounded(str: string): MidnightBech32m {
  const { prefix, bytes } = bech32m.decodeToBytes(str, false);
  const [mnPrefix, type, network = "mainnet"] = prefix.split("_");
  if (mnPrefix !== MidnightBech32m.prefix) {
    throw new Error(`Expected prefix ${MidnightBech32m.prefix}`);
  }
  return new MidnightBech32m(type, network, Buffer.from(bytes));
}

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

// Local-devnet-only well-known genesis seed. Not a secret -- fixed by the
// devnet itself, not usable on any real network. Confirmed (by directly
// checking its synced state) to hold pre-minted SHIELDED NIGHT as well as
// unshielded, so shielding via initSwap is unnecessary here -- a plain
// shielded-to-shielded transfer works.
const GENESIS_SEED_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";

// Usage: node --env-file=.env --import tsx src/shared/fund-shielded.ts <recipientShieldedAddress> <nightAmount>
const [RECIPIENT_ADDRESS, AMOUNT_STR] = process.argv.slice(2);
if (!RECIPIENT_ADDRESS || !AMOUNT_STR) {
  console.error(
    "Usage: npm run fund-shielded -- <recipientShieldedAddress> <nightAmount>",
  );
  process.exit(1);
}
const AMOUNT_NIGHT = BigInt(AMOUNT_STR) * 1_000_000n; // 6 decimal places

function deriveKeys(seed: Uint8Array) {
  const hdWallet = HDWallet.fromSeed(seed);
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

  const keys = deriveKeys(Buffer.from(GENESIS_SEED_HEX, "hex"));
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

  console.log("Initializing genesis wallet...");
  const genesisWallet = await WalletFacade.init({
    configuration: {
      networkId,
      indexerClientConnection: {
        indexerHttpUrl: INDEXER_HTTP,
        indexerWsUrl: INDEXER_WS,
      },
      // additionalFeeOverhead keeps the fee non-zero on an idle devnet so the
      // spend isn't rejected as NotNormalized (error 117) -- needed because this
      // wallet SPENDS.
      costParameters: {
        additionalFeeOverhead: 300_000_000_000_000n,
        feeBlocksMargin: 5,
      },
      provingServerUrl: new URL(PROOF_SERVER),
      relayURL: new URL(NODE_URL),
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
    await genesisWallet.start(shieldedSecretKeys, dustSecretKey);
    console.log("Syncing genesis wallet...");
    const state = await genesisWallet.waitForSyncedState();

    const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
    const genesisShielded = state.shielded.balances[NIGHT_TOKEN_TYPE] ?? 0n;
    console.log(`Genesis shielded NIGHT balance: ${genesisShielded}`);
    if (genesisShielded < AMOUNT_NIGHT) {
      throw new Error(
        `Genesis shielded balance (${genesisShielded}) is less than requested amount (${AMOUNT_NIGHT})`,
      );
    }

    const recipient = parseBech32mUnbounded(RECIPIENT_ADDRESS).decode(
      ShieldedAddress,
      networkId,
    );
    const outputs: CombinedTokenTransfer[] = [
      {
        type: "shielded",
        outputs: [
          {
            type: NIGHT_TOKEN_TYPE,
            receiverAddress: recipient,
            amount: AMOUNT_NIGHT,
          },
        ],
      },
    ];

    console.log(
      `Transferring ${AMOUNT_STR} shielded NIGHT to ${RECIPIENT_ADDRESS}...`,
    );
    const recipe = await genesisWallet.transferTransaction(
      outputs,
      { shieldedSecretKeys, dustSecretKey },
      { ttl: new Date(Date.now() + 60 * 60 * 1000), payFees: true },
    );
    const signed = await genesisWallet.signRecipe(recipe, (p) =>
      keystore.signData(p),
    );
    const finalized = await genesisWallet.finalizeRecipe(signed);
    const txId = await genesisWallet.submitTransaction(finalized);
    console.log(`Done! TX: ${txId}`);
  } finally {
    await genesisWallet.stop();
  }
}

main().catch((err) => {
  console.error("Funding failed:", err);
  process.exit(1);
});
