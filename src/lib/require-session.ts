import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { authOptions } from "@/auth";
import { redirect } from "@/i18n/navigation";
import type { SessionUser } from "@/lib/session-user";
import { toSessionUser } from "@/lib/session-user";

export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session) {
    const locale = await getLocale();
    redirect({ href: "/", locale });
    throw new Error("Unreachable: redirect() always throws");
  }

  return session;
}

/**
 * サインイン中のユーザの識別子とメールアドレスを返す
 *
 * 未サインインなら `requireSession()` と同じくトップへ遷移する
 */
export async function requireSessionUser(): Promise<SessionUser> {
  return toSessionUser(await requireSession());
}
