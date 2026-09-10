import "server-only";

import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { getSecretaryRuntime, secretaryDepsFor } from "@/adapters/runtime";
import type { SecretaryDeps } from "@/application/deps";
import type { IsoDateTime, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDateTime,
  parseUserId,
} from "@/domain/identifiers.parse";
import { getGoogleAccessToken } from "@/lib/google-token";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

/**
 * サインイン済みのユーザの代わりに use case を呼ぶために要るもの
 */
export type SecretaryContext = {
  userId: UserId;
  deps: SecretaryDeps;
  now: IsoDateTime;
};

/**
 * サインイン済みのユーザを特定できなかった理由
 *
 * `refreshFailed` は Google サインインで期限切れのトークンを更新できなかったとき
 */
export type SessionError =
  | { kind: "unauthenticated" }
  | { kind: "refreshFailed"; cause: unknown };

/**
 * next-auth の JWT からユーザ id を取り出す
 *
 * `sub` は Google サインインでは Google アカウントの subject、dev サインインでは `DEV_USER.id`
 * JWT が無いか `sub` が空なら unauthenticated
 */
export const userIdOf = (token: JWT | null): Result<UserId, SessionError> => {
  // next-auth の戻り値の境界なので null と比べる
  if (token === null || token.sub === undefined) {
    return err({ kind: "unauthenticated" });
  }

  const userId = parseUserId(token.sub);

  if (!userId.ok) {
    return err({ kind: "unauthenticated" });
  }

  return ok(userId.value);
};

// dev サインインのセッションには Google のトークンが無いので、解決も試みない
// GoogleTokenError の 2 つの kind は SessionError と同じ形なので、そのまま失敗として通す
const googleAccessTokenFor = async (
  request: NextRequest,
  nowMs: number,
): Promise<Result<string | undefined, SessionError>> => {
  if (getSecretaryRuntime().sources.auth !== "google") {
    return ok(undefined);
  }

  const token = await getGoogleAccessToken(
    request,
    {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    { fetch, nowMs },
  );

  if (!token.ok) {
    return err(token.error);
  }

  return ok(token.value);
};

/**
 * リクエストからサインイン済みユーザの文脈を組み立てる
 *
 * auth が google のときは `getGoogleAccessToken` でトークンも解決し、deps のカレンダーに渡す
 * auth が dev のときはトークンを解決しない (scan route と同じ)
 * 受け取った `NextRequest` をそのまま使う
 * 別の `Request` から `new NextRequest(request)` で作り直すと、production のチャンク分割では Request の private field を別のクラス定義から読むことになり throw する
 */
export const secretaryContextFor = async (
  request: NextRequest,
  nowMs: number,
): Promise<Result<SecretaryContext, SessionError>> => {
  const userId = userIdOf(await getToken({ req: request }));

  if (!userId.ok) {
    return userId;
  }

  const googleAccessToken = await googleAccessTokenFor(request, nowMs);

  if (!googleAccessToken.ok) {
    return googleAccessToken;
  }

  const now = mustParse(parseIsoDateTime(new Date(nowMs).toISOString()));
  const deps = secretaryDepsFor({
    now,
    ...(googleAccessToken.value === undefined
      ? {}
      : { googleAccessToken: googleAccessToken.value }),
  });

  return ok({ userId: userId.value, deps, now });
};

/**
 * いま処理中の Server Component の文脈を組み立てる
 *
 * `headers()` から `NextRequest` を作って `secretaryContextFor` に渡す
 * URL は `getToken` が見ないので固定でよい (文字列から作るので上の作り直しの問題は起きない)
 */
export const secretaryContext = async (): Promise<
  Result<SecretaryContext, SessionError>
> => {
  const request = new NextRequest("http://localhost", {
    headers: await headers(),
  });

  return secretaryContextFor(request, Date.now());
};
