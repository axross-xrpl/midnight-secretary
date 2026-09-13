import { createHash } from "node:crypto";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger } from "../managed/token/contract/index.js";

export type TokenPrivateState = {
  readonly ownerSecretKey: Uint8Array;
};

export const createTokenPrivateState = (
  ownerSecretKey: Uint8Array,
): TokenPrivateState => ({
  ownerSecretKey,
});

// Deterministically derives the contract-owner secret from the deployer's wallet
// seed, so no separate secret needs to be generated or stored. The domain
// separator keeps this distinct from any other key derived from the same seed
// (Zswap, Night, Dust roles all derive from it too).
export function deriveOwnerSecretKey(deployerSeedHex: string): Uint8Array {
  const domain = Buffer.from("midnight-secretary:owner-secret:v1", "utf8");
  const seedBytes = Buffer.from(deployerSeedHex, "hex");
  const hash = createHash("sha256").update(domain).update(seedBytes).digest();
  return new Uint8Array(hash);
}

export const witnesses = {
  getOwnerSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, TokenPrivateState>): [
    TokenPrivateState,
    { bytes: Uint8Array },
  ] => {
    return [privateState, { bytes: privateState.ownerSecretKey }];
  },
};
