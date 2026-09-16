import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import { Runtime, Cause } from "effect";

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
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Contract } from "../managed/age-verification/contract/index.js";
import {
  witnesses,
  createAgeVerificationPrivateState,
  deriveIdentitySecret,
  deriveDobSalt,
} from "./witnesses.js";
import { syncWallet } from "../shared/sync.js";
import {
  readWalletCache,
  installShutdownHandler,
} from "../shared/wallet-cache.js";

type AgeVerificationCircuitId = ContractNS.ProvableCircuitId<
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

// Deploys under the deployer's own seed, same as token.compact/
// shielded-token.compact -- but note the deployer has no special role in
// this contract once deployed (see witnesses.ts). Any funded seed could
// deploy it; this one is used only because it is already funded.
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
    const zkConfigPath = path.resolve(__dirname, "../managed/age-verification");
    const zkConfigProvider = new NodeZkConfigProvider<AgeVerificationCircuitId>(
      zkConfigPath,
    );

    const providers = {
      walletProvider: walletAndMidnightProvider,
      midnightProvider: walletAndMidnightProvider,
      publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
      // accountId is derived from the deployer's own identity secret, not a
      // fixed "deployer" string -- unlike token.compact/shielded-token.compact
      // (one owner/minter forever), age-verification has no persistent
      // special role, and register.ts/prove.ts use each REGISTRANT's own
      // derived accountId, which would collide with a shared fixed id across
      // different test registrants.
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: "age-verification-private-state",
        privateStoragePasswordProvider: () => "AgeVerification-Dev-Pa55word!",
        accountId: Buffer.from(deriveIdentitySecret(DEPLOYER_SEED)).toString(
          "hex",
        ),
      }),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    };

    console.log("Loading compiled contract...");
    const compiledContract = CompiledContract.make(
      "age-verification",
      Contract,
    ).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    );

    console.log("Deploying contract (this may take a minute)...");
    const deployed = await deployContract(providers, {
      compiledContract,
      privateStateId: "age-verification-private-state",
      // Inert at deploy time -- the contract has no constructor witnesses to
      // call (see age-verification.compact), this only establishes the
      // private-state shape for this script's own later reads, if any.
      initialPrivateState: createAgeVerificationPrivateState(
        deriveIdentitySecret(DEPLOYER_SEED),
        deriveDobSalt(DEPLOYER_SEED),
        0n,
      ),
      // constructor() takes no arguments
    });

    console.log("\nContract deployed successfully!");
    console.log(
      `  Address:     ${deployed.deployTxData.public.contractAddress}`,
    );
    console.log(`  TX ID:       ${deployed.deployTxData.public.txId}`);
    console.log(`  Block:       ${deployed.deployTxData.public.blockHeight}`);
  } finally {
    console.log("Saving sync cache...");
    await cleanup();
  }
}

function logErrorChain(err: unknown) {
  console.error("Deployment failed:", err instanceof Error ? err.message : err);

  let cause: unknown = err;
  const causeId = (err as Record<PropertyKey, unknown>)?.[
    Runtime.FiberFailureCauseId
  ];
  if (causeId) {
    try {
      cause = Cause.squash(causeId as Cause.Cause<unknown>);
      console.error("--- unwrapped Effect cause ---", cause);
    } catch {
      // fall through to generic walk below
    }
  }
  const seen = new Set<unknown>();
  let depth = 0;
  while (cause && typeof cause === "object" && !seen.has(cause) && depth < 10) {
    seen.add(cause);
    const props: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(cause)) {
      try {
        props[key] = (cause as Record<string, unknown>)[key];
      } catch {
        // ignore unreadable properties
      }
    }
    console.error(`--- cause (depth ${depth}) ---`, props);
    cause =
      (cause as { cause?: unknown; error?: unknown }).cause ??
      (cause as { error?: unknown }).error;
    depth += 1;
  }
}

main().catch((err) => {
  logErrorChain(err);
  process.exit(1);
});
