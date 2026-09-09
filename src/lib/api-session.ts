import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function hasApiSession(): Promise<boolean> {
  return (await getServerSession(authOptions)) !== null;
}
