import "server-only";
import { contractServerGet, contractServerPost } from "./network";

export type ShieldedTokenState = {
  mintCount: string;
  initialized: boolean;
  mintAllowanceRemaining: string;
};

export function getShieldedTokenState(): Promise<ShieldedTokenState> {
  return contractServerGet<ShieldedTokenState>("/shielded-token/state");
}

export function requestShieldedTokens(
  recipient: string,
): Promise<{ blockHeight: number; amount: string }> {
  // The server accepts either a full Bech32m shielded address or the raw hex
  // coin public key directly -- we pass through the connected wallet's
  // Bech32m shielded address (getShieldedAddresses().shieldedAddress) as-is.
  return contractServerPost("/shielded-token/request", { recipient });
}
