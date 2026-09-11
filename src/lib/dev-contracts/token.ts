import "server-only";
import { contractServerGet, contractServerPost } from "./network";

export type TokenState = {
  name: string;
  symbol: string;
  tokenColor: string;
  sendAllowanceRemaining: string;
};

export function getTokenState(): Promise<TokenState> {
  return contractServerGet<TokenState>("/token/state");
}

export function requestTokens(
  recipientUnshieldedAddress: string,
): Promise<{ blockHeight: number; amount: string }> {
  return contractServerPost("/token/request", { recipientUnshieldedAddress });
}
