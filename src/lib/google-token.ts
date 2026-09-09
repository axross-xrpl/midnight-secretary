import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { FetchLike } from "./http";
import type { Result } from "./result";
import { err, fromPromise, ok } from "./result";
import { fromZod } from "./schema";

/**
 * Google のアクセストークンを用意できなかった理由
 */
export type GoogleTokenError =
  | { kind: "unauthenticated" }
  | { kind: "refreshFailed"; cause: unknown };

/**
 * Google の OAuth クライアントの資格情報
 */
export type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * 更新後のトークン
 *
 * Google は更新時に refresh_token を返さないことが多いので任意にしている
 */
export type RefreshedGoogleToken = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
};

/**
 * トークンの取得に必要な I/O と現在時刻
 */
export type GoogleTokenDeps = {
  fetch: FetchLike;
  nowMs: number;
};

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// 期限ぎりぎりのトークンで API を叩かないよう 1 分の余裕を見る
const EXPIRY_MARGIN_MS = 60 * 1000;

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
});

const refreshFailed = (cause: unknown): GoogleTokenError => {
  return { kind: "refreshFailed", cause };
};

/**
 * アクセストークンが期限切れかどうかを判定する
 *
 * expiresAt は Google が返す秒単位の UNIX 時刻で、無ければ期限切れとして扱う
 */
export const isAccessTokenExpired = (
  expiresAt: number | undefined,
  nowMs: number,
): boolean => {
  if (expiresAt === undefined) {
    return true;
  }

  return expiresAt * 1000 - EXPIRY_MARGIN_MS <= nowMs;
};

/**
 * refresh_token でアクセストークンを更新する
 */
export const refreshGoogleAccessToken = async (
  refreshToken: string,
  credentials: GoogleCredentials,
  deps: GoogleTokenDeps,
): Promise<Result<RefreshedGoogleToken, GoogleTokenError>> => {
  const response = await fromPromise(
    deps.fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    }),
    refreshFailed,
  );

  if (!response.ok) {
    return response;
  }

  if (!response.value.ok) {
    return err(refreshFailed({ status: response.value.status }));
  }

  const body = await fromPromise(response.value.json(), refreshFailed);

  if (!body.ok) {
    return body;
  }

  const parsed = fromZod(tokenResponseSchema.safeParse(body.value));

  if (!parsed.ok) {
    return err(refreshFailed(parsed.error));
  }

  return ok({
    accessToken: parsed.value.access_token,
    expiresAt: Math.floor(deps.nowMs / 1000) + parsed.value.expires_in,
    ...(parsed.value.refresh_token === undefined
      ? {}
      : { refreshToken: parsed.value.refresh_token }),
  });
};

/**
 * リクエストのセッション JWT から有効な Google のアクセストークンを取り出す
 *
 * 期限切れなら refresh_token で更新した値を返す
 * 更新した値は cookie には書き戻さないので、次の要求では jwt コールバック側の更新に任せる
 */
export const getGoogleAccessToken = async (
  request: NextRequest,
  credentials: GoogleCredentials,
  deps: GoogleTokenDeps,
): Promise<Result<string, GoogleTokenError>> => {
  const token = await getToken({ req: request });

  if (token === null) {
    return err({ kind: "unauthenticated" });
  }

  if (
    token.accessToken !== undefined &&
    !isAccessTokenExpired(token.expiresAt, deps.nowMs)
  ) {
    return ok(token.accessToken);
  }

  if (token.refreshToken === undefined) {
    return err({ kind: "unauthenticated" });
  }

  const refreshed = await refreshGoogleAccessToken(
    token.refreshToken,
    credentials,
    deps,
  );

  if (!refreshed.ok) {
    return refreshed;
  }

  return ok(refreshed.value.accessToken);
};
