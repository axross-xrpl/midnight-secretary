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
  recipientCoinPublicKeyHex: string,
): Promise<{ blockHeight: number; amount: string }> {
  // The server accepts either a full bech32m shielded address or the raw hex
  // coin public key directly -- we always have the raw hex here (from the
  // connected wallet's getShieldedAddresses()).
  return contractServerPost("/shielded-token/request", {
    recipientCoinPublicKeyHex,
  });
}
