import { NextResponse } from "next/server";
import { getShieldedTokenState } from "@/lib/dev-contracts/shielded-token";

export async function GET() {
  try {
    const state = await getShieldedTokenState();
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
