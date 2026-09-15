import { createHash } from "node:crypto";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger } from "../managed/age-verification/contract/index.js";

/**
 * Unlike token.compact's owner key or shielded-token.compact's minter key --
 * both derived from DEPLOYER_SEED so a single operator identity stays stable
 * across script runs -- this witness data belongs to whichever person is
 * registering/proving, not to the contract's deployer. register() and
 * proveAdult() run entirely on the caller's own identity secret and date of
 * birth; there is no "owner" here by design (see age-verification.compact).
 * CLI scripts accept an optional seed argument (falling back to USER_SEED,
 * itself falling back to DEPLOYER_SEED) so a single devnet wallet can double
 * as a test registrant when no separate one is configured.
 *
 * dateOfBirth is not a derivable secret -- it is the literal data being
 * registered -- so it is not derived here; every script takes it as a CLI
 * argument, and the caller is responsible for supplying the SAME value to
 * both register and prove (exactly as DEPLOYER_SEED must stay identical
 * across token.compact's separate deploy/interact runs).
 */
export type AgeVerificationPrivateState = {
  readonly identitySecret: Uint8Array;
  readonly dobSalt: Uint8Array;
  readonly dateOfBirth: bigint; // YYYYMMDD, matches the circuit's Uint<32>
};

export const createAgeVerificationPrivateState = (
  identitySecret: Uint8Array,
  dobSalt: Uint8Array,
  dateOfBirth: bigint,
): AgeVerificationPrivateState => ({ identitySecret, dobSalt, dateOfBirth });

function deriveFromSeed(seedHex: string, domainLabel: string): Uint8Array {
  const domain = Buffer.from(domainLabel, "utf8");
  const seedBytes = Buffer.from(seedHex, "hex");
  const hash = createHash("sha256").update(domain).update(seedBytes).digest();
  return new Uint8Array(hash);
}

// Deterministic per-seed identity, so separate register/prove invocations
// against the same seed reconstruct the same pseudonym instead of minting a
// new one every run.
export function deriveIdentitySecret(seedHex: string): Uint8Array {
  return deriveFromSeed(
    seedHex,
    "midnight-secretary:age-verification:identity-secret:v1",
  );
}

// Deterministic per-seed salt, for the same reason: register() commits to
// deriveDobCommitment(dob, salt, sk), and a later, separate-process
// proveAdult() must supply the identical salt to reconstruct that
// commitment -- it cannot be re-randomized on every process start.
export function deriveDobSalt(seedHex: string): Uint8Array {
  return deriveFromSeed(
    seedHex,
    "midnight-secretary:age-verification:dob-salt:v1",
  );
}

export const witnesses = {
  identitySecret: ({
    privateState,
  }: WitnessContext<Ledger, AgeVerificationPrivateState>): [
    AgeVerificationPrivateState,
    Uint8Array,
  ] => [privateState, privateState.identitySecret],
  dobSalt: ({
    privateState,
  }: WitnessContext<Ledger, AgeVerificationPrivateState>): [
    AgeVerificationPrivateState,
    Uint8Array,
  ] => [privateState, privateState.dobSalt],
  dateOfBirth: ({
    privateState,
  }: WitnessContext<Ledger, AgeVerificationPrivateState>): [
    AgeVerificationPrivateState,
    bigint,
  ] => [privateState, privateState.dateOfBirth],
};
