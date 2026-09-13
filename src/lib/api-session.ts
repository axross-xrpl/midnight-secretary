import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import type { SessionUser } from "@/lib/session-user";
import { toSessionUser } from "@/lib/session-user";

export async function hasApiSession(): Promise<boolean> {
  return (await getServerSession(authOptions)) !== null;
}

/**
 * Route Handler 用にサインイン中のユーザを返す
 *
 * 未サインインは `null`。呼び出し側が 401 を返す
 */
export async function getApiSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);

  return session === null ? null : toSessionUser(session);
}
