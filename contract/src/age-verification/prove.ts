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
import * as ledger from "@midnight-ntwrk/ledger-v8";
import * as Rx from "rxjs";
import type {
  WalletProvider,
  MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";

import { Contract } from "../managed/age-verification/contract/index.js";
import {
  witnesses,
  createAgeVerificationPrivateState,
  deriveIdentitySecret,
  deriveDobSalt,
} from "./witnesses.js";

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

// Usage: node --env-file=.env --import tsx src/age-verification/prove.ts
//          <contractAddress> <dateOfBirthYYYYMMDD> <cutoffDateYYYYMMDD> [seedHex]
// dateOfBirth MUST be the exact value this seed registered with (register.ts
// commits to it; a mismatch fails with "Date of birth does not match
// registration", not a wrong boolean answer). cutoffDate is the verifier's
// number, e.g. today minus 20 years for Japanese alcohol/tobacco. seedHex
// defaults to USER_SEED, falling back to DEPLOYER_SEED, same as register.ts.
const [CONTRACT_ADDRESS, DOB_STR, CUTOFF_STR, SEED_OVERRIDE] =
  process.argv.slice(2);
if (!CONTRACT_ADDRESS || !DOB_STR || !CUTOFF_STR) {
  console.error(
    "Usage: npm run prove-age -- <contractAddress> <dateOfBirthYYYYMMDD> <cutoffDateYYYYMMDD> [seedHex]",
  );
  process.exit(1);
}
const DATE_OF_BIRTH = BigInt(DOB_STR);
const CUTOFF_DATE = BigInt(CUTOFF_STR);
const SEED_HEX =
  SEED_OVERRIDE ?? process.env.USER_SEED ?? requireEnv("DEPLOYER_SEED");

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
  const keys = deriveKeys(SEED_HEX);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);
  const identitySecret = deriveIdentitySecret(SEED_HEX);
  const dobSalt = deriveDobSalt(SEED_HEX);

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
    await Rx.firstValueFrom(
      facade.state().pipe(
        Rx.filter((s) => s.isSynced),
        Rx.timeout(120_000),
      ),
    );
    console.log("Wallet synced!");

    const state = await facade.waitForSyncedState();
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
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: "age-verification-private-state",
        privateStoragePasswordProvider: () => "AgeVerification-Dev-Pa55word!",
        accountId: Buffer.from(identitySecret).toString("hex"),
      }),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    };

    const compiledContract = CompiledContract.make(
      "age-verification",
      Contract,
    ).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    );

    console.log(`Finding deployed contract at ${CONTRACT_ADDRESS}...`);
    const contract = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: "age-verification-private-state",
      initialPrivateState: createAgeVerificationPrivateState(
        identitySecret,
        dobSalt,
        DATE_OF_BIRTH,
      ),
    });
    console.log("Contract found!");

    console.log(`\n--- Calling proveAdult(${CUTOFF_DATE}) ---`);
    const result = await contract.callTx.proveAdult(CUTOFF_DATE);
    console.log(`  Confirmed at block ${result.public.blockHeight}`);
    console.log(
      `  Result: ${result.private.result ? "born on or before cutoff (adult)" : "born after cutoff (not adult)"}`,
    );
  } finally {
    await facade.stop();
  }
}

main().catch((err) => {
  console.error("Proof failed:", err);
  process.exit(1);
});
