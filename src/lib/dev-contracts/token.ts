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
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";

// Cross-package import: the generated contract class + witnesses are owned by
// contract/, not duplicated here. contract/ is a subdirectory of this
// project's own root, so no special Next.js config is needed to reach it --
// just note the witnesses import must use the real .ts extension (Turbopack,
// unlike tsc/tsx, does not resolve a .js specifier to a sibling .ts file for
// paths outside src/).
import { Contract } from "../../../contract/src/managed/token/contract/index.js";
import {
  witnesses,
  createTokenPrivateState,
  deriveOwnerSecretKey,
} from "../../../contract/src/token/witnesses.ts";

import {
  requireEnv,
  INDEXER_HTTP,
  INDEXER_WS,
  PROOF_SERVER,
  withWallet,
  createMemoryPrivateStateProvider,
  type WalletHandle,
} from "./network";

type TokenCircuitId = ContractNS.ProvableCircuitId<
  InstanceType<typeof Contract>
>;

const DEPLOYER_SEED = requireEnv("DEPLOYER_SEED");
const CONTRACT_ADDRESS = requireEnv("NEXT_PUBLIC_TOKEN_ADDRESS");
// process.cwd() is the Next.js project root at runtime (dev and start).
const ZK_CONFIG_PATH = path.resolve(
  process.cwd(),
  "contract/src/managed/token",
);

// Modest fixed amount for a test faucet -- this is a dev tool, not a real
// distribution mechanism.
const FAUCET_AMOUNT = 1000n;

async function connectContract(walletProvider: WalletHandle["walletProvider"]) {
  const zkConfigProvider = new NodeZkConfigProvider<TokenCircuitId>(
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
  const compiledContract = CompiledContract.make("token", Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );
  const ownerSecretKey = deriveOwnerSecretKey(DEPLOYER_SEED);
  return findDeployedContract(providers, {
    contractAddress: CONTRACT_ADDRESS,
    compiledContract,
    privateStateId: "token-private-state",
    initialPrivateState: createTokenPrivateState(ownerSecretKey),
  });
}

export type TokenState = {
  name: string;
  symbol: string;
  tokenColor: string;
  sendAllowanceRemaining: string;
};

export async function getTokenState(): Promise<TokenState> {
  return withWallet(DEPLOYER_SEED, async ({ walletProvider }) => {
    const contract = await connectContract(walletProvider);
    const name = (await contract.callTx.getName()).private.result;
    const symbol = (await contract.callTx.getSymbol()).private.result;
    const tokenColor = Buffer.from(
      (await contract.callTx.getTokenColor()).private.result,
    ).toString("hex");
    const sendAllowanceRemaining = (
      await contract.callTx.getSendAllowance()
    ).private.result.toString();
    return { name, symbol, tokenColor, sendAllowanceRemaining };
  });
}

export async function requestTokens(
  recipientUnshieldedAddress: string,
): Promise<{
  txId: string;
  blockHeight: number;
  amount: string;
}> {
  return withWallet(DEPLOYER_SEED, async ({ networkId, walletProvider }) => {
    const contract = await connectContract(walletProvider);
    const decoded = MidnightBech32m.parse(recipientUnshieldedAddress).decode(
      UnshieldedAddress,
      networkId,
    );
    const recipient = {
      is_left: false,
      left: { bytes: new Uint8Array(32) },
      right: { bytes: new Uint8Array(decoded.data) },
    };
    const result = await contract.callTx.sendToken(recipient, FAUCET_AMOUNT);
    return {
      txId: result.public.txId,
      blockHeight: result.public.blockHeight,
      amount: FAUCET_AMOUNT.toString(),
    };
  });
}
