import { NextResponse } from "next/server";
import { requestShieldedTokens } from "@/lib/dev-contracts/shielded-token";

export async function POST(req: Request) {
  try {
    // The connected wallet's shielded address (Bech32m, from
    // getShieldedAddresses().shieldedAddress) -- the contract server decodes
    // it down to the raw coin public key the mint_and_send circuit expects.
    const { recipient } = (await req.json()) as {
      recipient?: string;
    };
    if (!recipient) {
      return NextResponse.json({ error: "Missing recipient" }, { status: 400 });
    }
    const result = await requestShieldedTokens(recipient);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
