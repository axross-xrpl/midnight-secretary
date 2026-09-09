import { createHash, randomBytes } from "node:crypto";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger } from "../managed/shielded-token/contract/index.js";

export type ShieldedTokenPrivateState = {
  readonly nonceSeed: Uint8Array;
  readonly minterSecret: Uint8Array;
};

// minterSecret MUST be identical across every script invocation (deploy,
// interact, ...) -- the constructor commits to it once via deriveMinterKey,
// and every later mint_and_send call re-derives and compares. A random
// default here would only work within a single process; deriving it from the
// deployer seed keeps it stable across separate `node` runs.
export function deriveMinterSecret(deployerSeedHex: string): Uint8Array {
  const domain = Buffer.from(
    "midnight-secretary:shielded-token:minter-secret:v1",
    "utf8",
  );
  const seedBytes = Buffer.from(deployerSeedHex, "hex");
  const hash = createHash("sha256").update(domain).update(seedBytes).digest();
  return new Uint8Array(hash);
}

export const createShieldedTokenPrivateState = (
  minterSecret: Uint8Array,
  nonceSeed: Uint8Array = new Uint8Array(randomBytes(32)),
): ShieldedTokenPrivateState => ({ nonceSeed, minterSecret });

export const witnesses = {
  localNonceSeed: ({
    privateState,
  }: WitnessContext<Ledger, ShieldedTokenPrivateState>): [
    ShieldedTokenPrivateState,
    Uint8Array,
  ] => [privateState, privateState.nonceSeed],
  minterSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, ShieldedTokenPrivateState>): [
    ShieldedTokenPrivateState,
    Uint8Array,
  ] => [privateState, privateState.minterSecret],
};
