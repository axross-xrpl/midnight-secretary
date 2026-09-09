import { createHash } from "node:crypto";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger } from "../managed/age-verification/contract/index.js";

export type AgeVerificationPrivateState = {
  readonly identitySecret: Uint8Array;
  readonly dobSalt: Uint8Array;
  // YYYYMMDD, e.g. 19900215n. Must match the Uint<32> encoding the contract
  // compares against cutoffDate.
  readonly dateOfBirth: bigint;
};

// identitySecret and dobSalt MUST be byte-identical in the `register` run and
// in every later `prove` run -- register commits to them once and proveAdult
// re-derives and compares. randomBytes() would only hold within a single
// process, so both are derived from the user's wallet seed instead.
function deriveFromSeed(domain: string, userSeedHex: string): Uint8Array {
  const hash = createHash("sha256")
    .update(Buffer.from(domain, "utf8"))
    .update(Buffer.from(userSeedHex, "hex"))
    .digest();
  return new Uint8Array(hash);
}

export function deriveIdentitySecret(userSeedHex: string): Uint8Array {
  return deriveFromSeed(
    "midnight-secretary:age-verification:identity-secret:v1",
    userSeedHex,
  );
}

// Salted so the on-chain commitment is hiding: the ~40k plausible YYYYMMDD
// values are otherwise cheap to enumerate against an unsalted digest.
export function deriveDobSalt(userSeedHex: string): Uint8Array {
  return deriveFromSeed(
    "midnight-secretary:age-verification:dob-salt:v1",
    userSeedHex,
  );
}

export const createAgeVerificationPrivateState = (
  userSeedHex: string,
  dateOfBirth: bigint,
): AgeVerificationPrivateState => ({
  identitySecret: deriveIdentitySecret(userSeedHex),
  dobSalt: deriveDobSalt(userSeedHex),
  dateOfBirth,
});

export const witnesses = {
  dateOfBirth: ({
    privateState,
  }: WitnessContext<Ledger, AgeVerificationPrivateState>): [
    AgeVerificationPrivateState,
    bigint,
  ] => [privateState, privateState.dateOfBirth],
  dobSalt: ({
    privateState,
  }: WitnessContext<Ledger, AgeVerificationPrivateState>): [
    AgeVerificationPrivateState,
    Uint8Array,
  ] => [privateState, privateState.dobSalt],
  identitySecret: ({
    privateState,
  }: WitnessContext<Ledger, AgeVerificationPrivateState>): [
    AgeVerificationPrivateState,
    Uint8Array,
  ] => [privateState, privateState.identitySecret],
};

// YYYYMMDD is validated here rather than in the circuit: a malformed date is a
// CLI mistake, and rejecting it off-chain costs no gates and leaks nothing.
export function parseYyyymmdd(input: string, label: string): bigint {
  if (!/^\d{8}$/.test(input)) {
    throw new Error(
      `${label} must be 8 digits in YYYYMMDD form (e.g. 19900215), got: ${input}`,
    );
  }
  const year = Number(input.slice(0, 4));
  const month = Number(input.slice(4, 6));
  const day = Number(input.slice(6, 8));
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    throw new Error(`${label} is not a real calendar date: ${input}`);
  }
  return BigInt(input);
}
