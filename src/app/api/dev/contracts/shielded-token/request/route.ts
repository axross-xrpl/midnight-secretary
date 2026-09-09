import { NextResponse } from "next/server";
import { requestShieldedTokens } from "@/lib/dev-contracts/shielded-token";

export async function POST(req: Request) {
  try {
    // Raw ZswapCoinPublicKey hex, not a bech32m shielded address -- the page
    // decodes the connected wallet's shielded address down to this first.
    const { coinPublicKeyHex } = (await req.json()) as {
      coinPublicKeyHex?: string;
    };
    if (!coinPublicKeyHex) {
      return NextResponse.json(
        { error: "Missing coinPublicKeyHex" },
        { status: 400 },
      );
    }
    const result = await requestShieldedTokens(coinPublicKeyHex);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
