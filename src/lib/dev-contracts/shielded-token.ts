import "server-only";
import path from "node:path";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  CompiledContract,
  type Contract as ContractNS,
} from "@midnight-ntwrk/compact-js";

import { Contract } from "../../../contract/src/managed/shielded-token/contract/index.js";
import {
  witnesses,
  createShieldedTokenPrivateState,
  deriveMinterSecret,
} from "../../../contract/src/shielded-token/witnesses.ts";

import {
  requireEnv,
  INDEXER_HTTP,
  INDEXER_WS,
  PROOF_SERVER,
  withWallet,
  createMemoryPrivateStateProvider,
  type WalletHandle,
} from "./network";

type ShieldedTokenCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof Contract>
>;

const DEPLOYER_SEED = requireEnv("DEPLOYER_SEED");
const CONTRACT_ADDRESS = requireEnv("NEXT_PUBLIC_SHIELDED_TOKEN_ADDRESS");
const ZK_CONFIG_PATH = path.resolve(
  process.cwd(),
  "contract/src/managed/shielded-token",
);

// Modest fixed amount for a test faucet -- this is a dev tool, not a real
// distribution mechanism.
const FAUCET_AMOUNT = 1000n;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(Buffer.from(clean, "hex"));
}

async function connectContract(walletProvider: WalletHandle["walletProvider"]) {
  const zkConfigProvider = new NodeZkConfigProvider<ShieldedTokenCircuitId>(
    ZK_CONFIG_PATH,
  );
  const providers = {
    walletProvider,
    midnightProvider: walletProvider,
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    privateStateProvider: createMemoryPrivateStateProvider(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
  };
  const compiledContract = CompiledContract.make(
    "shielded-token",
    Contract,
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );
  return findDeployedContract(providers, {
    contractAddress: CONTRACT_ADDRESS,
    compiledContract,
    privateStateId: "shielded-token-private-state",
    initialPrivateState: createShieldedTokenPrivateState(
      deriveMinterSecret(DEPLOYER_SEED),
    ),
  });
}

export type ShieldedTokenState = {
  mintCount: string;
  initialized: boolean;
  mintAllowanceRemaining: string;
};

export async function getShieldedTokenState(): Promise<ShieldedTokenState> {
  return withWallet(DEPLOYER_SEED, async ({ walletProvider }) => {
    const contract = await connectContract(walletProvider);
    const mintCount = (
      await contract.callTx.getMintCount()
    ).private.result.toString();
    const initialized = (await contract.callTx.getInitialized()).private.result;
    const mintAllowanceRemaining = (
      await contract.callTx.getMintAllowance()
    ).private.result.toString();
    return { mintCount, initialized, mintAllowanceRemaining };
  });
}

export async function requestShieldedTokens(
  recipientCoinPublicKeyHex: string,
): Promise<{
  txId: string;
  blockHeight: number;
  amount: string;
}> {
  return withWallet(DEPLOYER_SEED, async ({ walletProvider }) => {
    const contract = await connectContract(walletProvider);
    const recipient = { bytes: hexToBytes(recipientCoinPublicKeyHex) };
    // nonceIndex must differ on every call -- evolveNonce(nonceIndex,
    // localNonceSeed) would otherwise risk repeating with a reused seed.
    // The on-chain mint counter is already a strictly-increasing value we
    // don't have to track ourselves, so reuse it as the index.
    const nonceIndex = (await contract.callTx.getMintCount()).private.result;
    const result = await contract.callTx.mint_and_send(
      recipient,
      FAUCET_AMOUNT,
      nonceIndex,
    );
    return {
      txId: result.public.txId,
      blockHeight: result.public.blockHeight,
      amount: FAUCET_AMOUNT.toString(),
    };
  });
}
