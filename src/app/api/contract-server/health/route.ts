import { NextResponse } from "next/server";
import { getContractServerHealth } from "@/lib/dev-contracts/network";

// Always 200: "unreachable" is a normal, expected value of this endpoint's
// own response body, not a failure of the endpoint itself.
export async function GET() {
  const health = await getContractServerHealth();
  return NextResponse.json(health);
}
