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
import type {
  WalletProvider,
  MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import { bech32m } from "@scure/base";

import { Contract } from "../managed/shielded-token/contract/index.js";
import {
  witnesses,
  createShieldedTokenPrivateState,
  deriveMinterSecret,
} from "./witnesses.js";
import { syncWallet } from "../shared/sync.js";

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

// Usage: node --env-file=.env --import tsx src/shielded-token/interact.ts <contractAddress> <recipientShieldedAddressOrCoinPublicKeyHex> <amount> [nonceIndex]
const [CONTRACT_ADDRESS, RECIPIENT_ARG, AMOUNT_STR, NONCE_INDEX_STR] =
  process.argv.slice(2);
if (!CONTRACT_ADDRESS || !RECIPIENT_ARG || !AMOUNT_STR) {
  console.error(
    "Usage: npm run interact-shielded-token -- <contractAddress> <recipientShieldedAddressOrCoinPublicKeyHex> <amount> [nonceIndex]",
  );
  process.exit(1);
}
const AMOUNT = BigInt(AMOUNT_STR);
const NONCE_INDEX = BigInt(NONCE_INDEX_STR ?? "0");

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(Buffer.from(clean, "hex"));
}

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

// The mint_and_send circuit wants just the raw 32-byte coin public key, not
// a full shielded address (which also bundles an encryption key) -- but a
// full bech32m address ("mn_shield-addr_...") is what a wallet actually
// displays/shares, so accept either: decode-and-extract for an address,
// treat anything else as already being the raw hex.
function resolveRecipientCoinPublicKey(
  arg: string,
  networkId: string,
): Uint8Array {
  if (arg.startsWith(`${MidnightBech32m.prefix}_shield-addr_`)) {
    const address = parseBech32mUnbounded(arg).decode(
      ShieldedAddress,
      networkId,
    );
    return new Uint8Array(address.coinPublicKey.data);
  }
  return hexToBytes(arg);
}

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
        // mint_and_send's minted+immediately-spent coin is a self-authorized
        // kernel mint just like in deploy.ts -- same client-side balancer
        // limitation applies here too.
        const recipe = await facade.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys, dustSecretKey },
          {
            ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000),
            tokenKindsToBalance: ["unshielded", "dust"],
          },
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

    const compiledContract = CompiledContract.make(
      "shielded-token",
      Contract,
    ).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    );

    console.log(`Finding deployed contract at ${CONTRACT_ADDRESS}...`);
    const contract = await findDeployedContract(providers, {
      contractAddress: CONTRACT_ADDRESS,
      compiledContract,
      privateStateId: "shielded-token-private-state",
      initialPrivateState: createShieldedTokenPrivateState(
        deriveMinterSecret(DEPLOYER_SEED),
      ),
    });
    console.log("Contract found!");

    const recipient = {
      bytes: resolveRecipientCoinPublicKey(RECIPIENT_ARG, networkId),
    };

    // Fails with "amount exceeds remaining mint allowance" once the budget is
    // spent down -- top it back up with `npm run set-allowance-shielded-token`.
    console.log(
      `\n--- Calling mint_and_send(${RECIPIENT_ARG}, ${AMOUNT}, ${NONCE_INDEX}) ---`,
    );
    const result = await contract.callTx.mint_and_send(
      recipient,
      AMOUNT,
      NONCE_INDEX,
    );
    console.log(`  Confirmed at block ${result.public.blockHeight}`);
  } finally {
    await facade.stop();
  }
}

main().catch((err) => {
  console.error("Interaction failed:", err);
  process.exit(1);
});
