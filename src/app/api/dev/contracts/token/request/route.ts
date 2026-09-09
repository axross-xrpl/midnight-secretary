import { NextResponse } from "next/server";
import { requestTokens } from "@/lib/dev-contracts/token";

export async function POST(req: Request) {
  try {
    const { address } = (await req.json()) as { address?: string };
    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }
    const result = await requestTokens(address);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
