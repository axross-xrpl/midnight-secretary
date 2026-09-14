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
  UnshieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
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

// Local-devnet-only well-known genesis seed. Pre-mints NIGHT on the "undeployed"
// network. Not a secret -- fixed by the devnet itself, not usable on any real network.
const GENESIS_SEED_HEX =
  "0000000000000000000000000000000000000000000000000000000000000001";

// Usage: node --env-file=.env --import tsx src/shared/fund.ts <recipientUnshieldedAddress> <nightAmount>
const [RECIPIENT_ADDRESS, AMOUNT_STR] = process.argv.slice(2);
if (!RECIPIENT_ADDRESS || !AMOUNT_STR) {
  console.error(
    "Usage: npm run fund -- <recipientUnshieldedAddress> <nightAmount>",
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
    await genesisWallet.waitForSyncedState();

    const recipient = MidnightBech32m.parse(RECIPIENT_ADDRESS).decode(
      UnshieldedAddress,
      networkId,
    );
    const NIGHT_TOKEN_TYPE = ledger.nativeToken().raw;
    const outputs: CombinedTokenTransfer[] = [
      {
        type: "unshielded",
        outputs: [
          {
            type: NIGHT_TOKEN_TYPE,
            receiverAddress: recipient,
            amount: AMOUNT_NIGHT,
          },
        ],
      },
    ];

    console.log(`Transferring ${AMOUNT_STR} NIGHT to ${RECIPIENT_ADDRESS}...`);
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
