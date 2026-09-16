import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
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
import * as ledger from "@midnight-ntwrk/ledger-v8";
import type {
  WalletProvider,
  MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";

import { Contract } from "../managed/shielded-token/contract/index.js";
import {
  witnesses,
  createShieldedTokenPrivateState,
  deriveMinterSecret,
} from "./witnesses.js";
import { syncWallet } from "../shared/sync.js";
import {
  readWalletCache,
  installShutdownHandler,
} from "../shared/wallet-cache.js";

type ShieldedTokenCircuitId = ContractNS.ProvableCircuitId<
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

// mintAllowance starts at 0 on-chain, so without this the deployed contract
// cannot mint anything. Granted here so a fresh deploy is immediately usable;
// raise or lower it later with `npm run set-allowance-shielded-token`.
const MINT_ALLOWANCE = BigInt(requireEnv("MINT_ALLOWANCE")); // Uint<64>

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

  // Shared with sync.ts, get-address.ts, and the other deploy scripts: same
  // (networkId, seedHex) key means whichever of them last ran leaves this
  // seed's sync progress for the next one, instead of each replaying from
  // genesis separately.
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
      // Default batch size (10) makes shielded/dust's replay of a long
      // preview/preprod history very slow -- see
      // https://github.com/midnightntwrk/midnight-wallet/issues/425.
      batchUpdates: { size: 5000 },
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

  const cleanup = installShutdownHandler(NETWORK_ID, DEPLOYER_SEED, facade);

  try {
    console.log("Starting wallet facade (connecting to node and indexer)...");
    await facade.start(shieldedSecretKeys, dustSecretKey);

    console.log("Waiting for wallet to sync...");
    const state = await syncWallet(console, facade, 2_000);
    console.log("Wallet synced!");

    const walletAndMidnightProvider: WalletProvider & MidnightProvider = {
      getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
      getEncryptionPublicKey: () =>
        state.shielded.encryptionPublicKey.toHexString(),
      async balanceTx(tx, ttl) {
        // The constructor here does nothing shielded (no mint) -- default
        // balancing across all token kinds should be fine, unlike deploy.ts.
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
    const zkConfigPath = path.resolve(__dirname, "../managed/shielded-token");
    const zkConfigProvider = new NodeZkConfigProvider<ShieldedTokenCircuitId>(
      zkConfigPath,
    );

    const providers = {
      walletProvider: walletAndMidnightProvider,
      midnightProvider: walletAndMidnightProvider,
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: "shielded-token-private-state",
        privateStoragePasswordProvider: () => "ShieldedToken-Dev-Pa55word!",
        accountId: "deployer",
      }),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    };

    console.log("Loading compiled contract...");
    const compiledContract = CompiledContract.make(
      "shielded-token",
      Contract,
    ).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    );

    console.log("Deploying contract (this may take a minute)...");
    const deployed = await deployContract(providers, {
      compiledContract,
      privateStateId: "shielded-token-private-state",
      initialPrivateState: createShieldedTokenPrivateState(
        deriveMinterSecret(DEPLOYER_SEED),
      ),
      // constructor() takes no arguments
    });

    console.log("\nContract deployed successfully!");
    console.log(
      `  Address:     ${deployed.deployTxData.public.contractAddress}`,
    );
    console.log(`  TX ID:       ${deployed.deployTxData.public.txId}`);
    console.log(`  Block:       ${deployed.deployTxData.public.blockHeight}`);

    console.log(`\nGranting mint allowance (${MINT_ALLOWANCE})...`);
    const granted = await deployed.callTx.setMintAllowance(MINT_ALLOWANCE);
    console.log(`  Confirmed at block ${granted.public.blockHeight}`);
  } finally {
    console.log("Saving sync cache...");
    await cleanup();
  }
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
