import type { Session } from "next-auth";

/**
 * `user_profiles` の1行を特定するために必要なセッションの情報
 *
 * `userId` は主キー、`email` は NOT NULL かつ UNIQUE なので、
 * どちらもクライアントから受け取らずセッションから決める
 */
export type SessionUser = {
  userId: string;
  email: string;
  name: string | null;
};

/**
 * セッションからユーザの識別子とメールアドレスを取り出す
 *
 * どちらも欠けないことを認証側で保証している(`sessionWithUserId` と Google の scope)ため、
 * 欠けている場合は期待される失敗ではなく設定のバグとして落とす
 */
export function toSessionUser(session: Session): SessionUser {
  const id = session.user?.id;
  const email = session.user?.email;

  if (!id || !email) {
    throw new Error("bug: the session has no user id or email");
  }

  return { userId: id, email, name: session.user?.name ?? null };
}
