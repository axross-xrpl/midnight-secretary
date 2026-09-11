import { WebSocket } from "ws";
// @ts-expect-error WebSocket polyfill for apollo client
globalThis.WebSocket = WebSocket;

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  setNetworkId,
  getNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import {
  findDeployedContract,
  withContractScopedTransaction,
} from "@midnight-ntwrk/midnight-js-contracts";
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
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import { bech32m } from "@scure/base";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import * as Rx from "rxjs";
import type {
  WalletProvider,
  MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";

import { Contract as TokenContract } from "./managed/token/contract/index.js";
import {
  witnesses as tokenWitnesses,
  createTokenPrivateState,
  deriveOwnerSecretKey,
} from "./token/witnesses.js";
import { Contract as ShieldedTokenContract } from "./managed/shielded-token/contract/index.js";
import {
  witnesses as shieldedTokenWitnesses,
  createShieldedTokenPrivateState,
  deriveMinterSecret,
} from "./shielded-token/witnesses.js";

/**
 * Long-lived faucet backend for /dev/contracts. Unlike the one-shot CLI
 * scripts (interact.ts, get-state.ts, ...), this keeps a single WalletFacade
 * synced and connected to both deployed contracts for as long as the process
 * runs, so the multi-minute wallet-sync cost is paid once at startup instead
 * of on every request. root's Next.js app talks to this over HTTP (see
 * src/lib/dev-contracts/network.ts) instead of spawning a subprocess per
 * call. Started alongside `npm run dev` at the repo root via `concurrently`
 * (see root package.json + scripts/start-contract-server.mjs).
 *
 * Both contracts share one deployer/owner account, so every callTx call
 * across both routes is serialized through a single queue below -- running
 * two concurrently races for that account's next on-chain nonce and one
 * submission gets rejected by the node.
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
const TOKEN_ADDRESS = requireEnv("TOKEN_ADDRESS");
const SHIELDED_TOKEN_ADDRESS = requireEnv("SHIELDED_TOKEN_ADDRESS");
const PORT = Number(process.env.CONTRACT_SERVER_PORT ?? 4900);

type TokenCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof TokenContract>
>;
type ShieldedTokenCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof ShieldedTokenContract>
>;

// Modest fixed amount for a test faucet -- this is a dev tool, not a real
// distribution mechanism.
const FAUCET_AMOUNT = 1000n;

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

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(Buffer.from(clean, "hex"));
}

// See interact-shielded-token.ts for why this bypasses MidnightBech32m.parse's
// built-in length check (a shielded address is longer than @scure/base's
// default 90-char cap).
function parseBech32mUnbounded(str: string): MidnightBech32m {
  const { prefix, bytes } = bech32m.decodeToBytes(str, false);
  const [mnPrefix, type, network = "mainnet"] = prefix.split("_");
  if (mnPrefix !== MidnightBech32m.prefix) {
    throw new Error(`Expected prefix ${MidnightBech32m.prefix}`);
  }
  return new MidnightBech32m(type, network, Buffer.from(bytes));
}

type ResolvedRecipient = {
  coinPublicKey: Uint8Array;
  // Only known when `arg` was a full shielded address -- a bare hex coin
  // public key carries no encryption key, so mint_and_send will only work
  // for such a recipient if the wallet's own zswap state already has a
  // mapping for them (see additionalCoinEncPublicKeyMappings below).
  encryptionPublicKeyHex?: string;
};

function resolveRecipient(arg: string, networkId: string): ResolvedRecipient {
  if (arg.startsWith(`${MidnightBech32m.prefix}_shield-addr_`)) {
    const address = parseBech32mUnbounded(arg).decode(
      ShieldedAddress,
      networkId,
    );
    return {
      coinPublicKey: new Uint8Array(address.coinPublicKey.data),
      encryptionPublicKeyHex: address.encryptionPublicKeyString(),
    };
  }
  return { coinPublicKey: hexToBytes(arg) };
}

// Every route below acts as the same deployer account, so serialize all of
// them behind one queue regardless of which contract they touch.
let queue: Promise<void> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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

  console.log("Starting wallet facade...");
  await facade.start(shieldedSecretKeys, dustSecretKey);

  console.log(
    "Waiting for wallet to sync (this is the slow part, paid once at startup)...",
  );
  const state = await Rx.firstValueFrom(
    facade.state().pipe(
      Rx.filter((s) => s.isSynced),
      Rx.timeout(180_000),
    ),
  );
  console.log("Wallet synced!");

  const walletAndMidnightProvider: WalletProvider & MidnightProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () =>
      state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
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

  const tokenZkConfigPath = path.resolve(__dirname, "managed/token");
  const tokenZkConfigProvider = new NodeZkConfigProvider<TokenCircuitId>(
    tokenZkConfigPath,
  );
  const tokenProviders = {
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "token-private-state",
      privateStoragePasswordProvider: () => "Token-Dev-Pa55word!",
      accountId: "deployer",
    }),
    zkConfigProvider: tokenZkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER, tokenZkConfigProvider),
  };
  const tokenCompiledContract = CompiledContract.make(
    "token",
    TokenContract,
  ).pipe(
    CompiledContract.withWitnesses(tokenWitnesses),
    CompiledContract.withCompiledFileAssets(tokenZkConfigPath),
  );

  console.log(`Finding deployed token contract at ${TOKEN_ADDRESS}...`);
  const ownerSecretKey = deriveOwnerSecretKey(DEPLOYER_SEED);
  const tokenContract = await findDeployedContract(tokenProviders, {
    contractAddress: TOKEN_ADDRESS,
    compiledContract: tokenCompiledContract,
    privateStateId: "token-private-state",
    initialPrivateState: createTokenPrivateState(ownerSecretKey),
  });
  console.log("Token contract found!");

  const shieldedZkConfigPath = path.resolve(
    __dirname,
    "managed/shielded-token",
  );
  const shieldedZkConfigProvider =
    new NodeZkConfigProvider<ShieldedTokenCircuitId>(shieldedZkConfigPath);
  const shieldedProviders = {
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "shielded-token-private-state",
      privateStoragePasswordProvider: () => "ShieldedToken-Dev-Pa55word!",
      accountId: "deployer",
    }),
    zkConfigProvider: shieldedZkConfigProvider,
    proofProvider: httpClientProofProvider(
      PROOF_SERVER,
      shieldedZkConfigProvider,
    ),
  };
  const shieldedCompiledContract = CompiledContract.make(
    "shielded-token",
    ShieldedTokenContract,
  ).pipe(
    CompiledContract.withWitnesses(shieldedTokenWitnesses),
    CompiledContract.withCompiledFileAssets(shieldedZkConfigPath),
  );

  console.log(
    `Finding deployed shielded-token contract at ${SHIELDED_TOKEN_ADDRESS}...`,
  );
  const shieldedContract = await findDeployedContract(shieldedProviders, {
    contractAddress: SHIELDED_TOKEN_ADDRESS,
    compiledContract: shieldedCompiledContract,
    privateStateId: "shielded-token-private-state",
    initialPrivateState: createShieldedTokenPrivateState(
      deriveMinterSecret(DEPLOYER_SEED),
    ),
  });
  console.log("Shielded-token contract found!");

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/token/state") {
      const result = await serialize(async () => {
        // One transaction instead of four -- see token.compact's
        // getTokenInfo for why that matters here.
        const info = (await tokenContract.callTx.getTokenInfo()).private.result;
        return {
          name: info.name,
          symbol: info.symbol,
          tokenColor: Buffer.from(info.tokenColor).toString("hex"),
          sendAllowanceRemaining: info.sendAllowance.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/token/request") {
      const body = await readJsonBody(req);
      const recipientUnshieldedAddress = String(
        body.recipientUnshieldedAddress ?? "",
      );
      if (!recipientUnshieldedAddress) {
        return sendJson(res, 400, {
          error: "Missing recipientUnshieldedAddress",
        });
      }
      const result = await serialize(async () => {
        const recipientAddress = MidnightBech32m.parse(
          recipientUnshieldedAddress,
        ).decode(UnshieldedAddress, networkId);
        const recipient = {
          is_left: false,
          left: { bytes: new Uint8Array(32) },
          right: { bytes: new Uint8Array(recipientAddress.data) },
        };
        const txResult = await tokenContract.callTx.sendToken(
          recipient,
          FAUCET_AMOUNT,
        );
        return {
          blockHeight: txResult.public.blockHeight,
          amount: FAUCET_AMOUNT.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/shielded-token/state") {
      const result = await serialize(async () => {
        // One transaction instead of three -- see shielded-token.compact's
        // getShieldedTokenInfo for why that matters here.
        const info = (await shieldedContract.callTx.getShieldedTokenInfo())
          .private.result;
        return {
          mintCount: info.mintCount.toString(),
          initialized: info.initialized,
          mintAllowanceRemaining: info.mintAllowance.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/shielded-token/request") {
      const body = await readJsonBody(req);
      const recipientArg = String(body.recipient ?? "");
      if (!recipientArg) {
        return sendJson(res, 400, { error: "Missing recipient" });
      }
      const result = await serialize(async () => {
        const resolved = resolveRecipient(recipientArg, networkId);
        const recipient = { bytes: resolved.coinPublicKey };
        // mint_and_send creates a coin output for `recipient`, who isn't
        // the server's own wallet -- the SDK refuses to build that output
        // ("Unable to resolve encryption public key for recipient ...")
        // unless it's told which EncPublicKey to encrypt it to. That mapping
        // is scoped per-transaction via withContractScopedTransaction, not
        // passed directly to callTx.
        const additionalCoinEncPublicKeyMappings =
          resolved.encryptionPublicKeyHex
            ? new Map([
                [
                  Buffer.from(resolved.coinPublicKey).toString("hex"),
                  resolved.encryptionPublicKeyHex,
                ],
              ])
            : undefined;
        const finalized = await withContractScopedTransaction(
          shieldedProviders,
          async (txCtx) => {
            await shieldedContract.callTx.mint_and_send(
              txCtx,
              recipient,
              FAUCET_AMOUNT,
              0n,
            );
          },
          { additionalCoinEncPublicKeyMappings },
        );
        return {
          blockHeight: finalized.public.blockHeight,
          amount: FAUCET_AMOUNT.toString(),
        };
      });
      return sendJson(res, 200, result);
    }

    sendJson(res, 404, { error: "Not found" });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("Request failed:", err);
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Contract server listening on http://127.0.0.1:${PORT}`);
  });

  const shutdown = async () => {
    console.log("Shutting down contract server...");
    server.close();
    await facade.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Contract server failed to start:", err);
  process.exit(1);
});
