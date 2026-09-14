import { NextResponse } from "next/server";
import { getTokenState } from "@/lib/dev-contracts/token";

export async function GET() {
  try {
    const state = await getTokenState();
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
