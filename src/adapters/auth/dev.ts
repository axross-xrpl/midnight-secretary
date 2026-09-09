import type { NextAuthOptions } from "next-auth";
import type { UserId } from "@/domain/identifiers";
import type { AuthSource } from "@/application/sources";

/**
 * dev サインインが生み出す唯一のユーザ
 *
 * このセッションには Google のトークンが存在しない
 */
export type DevUser = {
  id: UserId;
  name: string;
  email: string;
};

/**
 * Google OAuth のクライアント資格情報
 *
 * 呼び出し側が環境変数から読む
 */
export type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * 選ばれたサインイン方式に応じた next-auth のオプション
 *
 * `google` は既存の provider で、カレンダーの scope とトークン更新を持つ
 * `dev` は Credentials provider で、`devUser` を 1 クリックでサインインさせ、Google のトークンは発行しない
 */
export const authOptionsFor = (
  _source: AuthSource,
  _google: GoogleCredentials,
  _devUser: DevUser,
): NextAuthOptions => {
  return { providers: [] };
};
