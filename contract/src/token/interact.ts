import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
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
} from "@midnight-ntwrk/wallet-sdk-address-format";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import type {
  WalletProvider,
  MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";

import { Contract } from "../managed/token/contract/index.js";
import {
  witnesses,
  createTokenPrivateState,
  deriveOwnerSecretKey,
} from "./witnesses.js";
import { syncWallet } from "../shared/sync.js";

type TokenCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof Contract>
>;

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

// Usage: node --env-file=.env --import tsx src/token/interact.ts <contractAddress> <recipientUnshieldedAddress> <amount>
const [CONTRACT_ADDRESS, RECIPIENT_ADDRESS, AMOUNT_STR] = process.argv.slice(2);
if (!CONTRACT_ADDRESS || !RECIPIENT_ADDRESS || !AMOUNT_STR) {
  console.error(
    "Usage: npm run interact -- <contractAddress> <recipientUnshieldedAddress> <amount>",
  );
  process.exit(1);
}
const AMOUNT = BigInt(AMOUNT_STR);

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
  console.log("Setting up network...");
  setNetworkId(NETWORK_ID);
  const networkId = getNetworkId();

  console.log("Deriving wallet keys...");
  const keys = deriveKeys(DEPLOYER_SEED);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

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
    console.log("Starting wallet facade...");
    await facade.start(shieldedSecretKeys, dustSecretKey);

    console.log("Waiting for wallet to sync...");
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
          { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
        );
        return await facade.finalizeRecipe(recipe);
      },
      submitTx: (tx) => facade.submitTransaction(tx),
    };

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const zkConfigPath = path.resolve(__dirname, "../managed/token");
    const zkConfigProvider = new NodeZkConfigProvider<TokenCircuitId>(
      zkConfigPath,
    );

    const providers = {
      walletProvider: walletAndMidnightProvider,
      midnightProvider: walletAndMidnightProvider,
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: "token-private-state",
        privateStoragePasswordProvider: () => "Token-Dev-Pa55word!",
        accountId: "deployer",
      }),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    };

    const compiledContract = CompiledContract.make("token", Contract).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    );

    console.log(`Finding deployed contract at ${CONTRACT_ADDRESS}...`);
    const ownerSecretKey = deriveOwnerSecretKey(DEPLOYER_SEED);
    const contract = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: "token-private-state",
      initialPrivateState: createTokenPrivateState(ownerSecretKey),
    });
    console.log("Contract found!");

    const recipientAddress = MidnightBech32m.parse(RECIPIENT_ADDRESS).decode(
      UnshieldedAddress,
      networkId,
    );
    const recipient = {
      is_left: false,
      left: { bytes: new Uint8Array(32) }, // unused ContractAddress placeholder
      right: { bytes: new Uint8Array(recipientAddress.data) },
    };

    // Fails with "Amount exceeds remaining send allowance" once the budget is
    // spent down -- top it back up with `npm run set-allowance`.
    console.log(`\n--- Calling sendToken(${RECIPIENT_ADDRESS}, ${AMOUNT}) ---`);
    const result = await contract.callTx.sendToken(recipient, AMOUNT);
    console.log(`  Confirmed at block ${result.public.blockHeight}`);
  } finally {
    await facade.stop();
  }
}

main().catch((err) => {
  console.error("Interaction failed:", err);
  process.exit(1);
});
