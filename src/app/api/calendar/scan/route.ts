import type { NextRequest } from "next/server";
import { getSecretaryRuntime, secretaryDepsFor } from "@/adapters/runtime";
import type { AuthSource } from "@/application/sources";
import type { CalendarError } from "@/domain/calendar";
import type { IsoDateTime } from "@/domain/identifiers";
import { mustParse, parseIsoDateTime } from "@/domain/identifiers.parse";
import type { ScanErrorKind, ScanResponse } from "@/lib/calendar-scan-response";
import type { GoogleTokenError } from "@/lib/google-token";
import { getGoogleAccessToken } from "@/lib/google-token";
import type { Result } from "@/lib/result";
import { ok } from "@/lib/result";

// 参考実装と同じく今日から 30 日先までを見る
const SCAN_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// 失敗の理由ごとに返す HTTP ステータス
const STATUS_BY_KIND = {
  unauthenticated: 401,
  tokenExpired: 401,
  refreshFailed: 401,
  forbidden: 403,
  http: 502,
  network: 502,
  schema: 502,
} as const satisfies Record<ScanErrorKind, number>;

const errorResponse = (error: GoogleTokenError | CalendarError): Response => {
  // 型注釈で、失敗の理由が応答スキーマの一覧から漏れていないことを tsc に確かめさせる
  const kind: ScanErrorKind = error.kind;

  return Response.json({ error: { kind } }, { status: STATUS_BY_KIND[kind] });
};

const isoAt = (ms: number): IsoDateTime => {
  return mustParse(parseIsoDateTime(new Date(ms).toISOString()));
};

// dev サインインのセッションには Google のトークンが無いので、解決も試みない
const resolveAccessToken = async (
  request: NextRequest,
  auth: AuthSource,
  nowMs: number,
): Promise<Result<string | undefined, GoogleTokenError>> => {
  if (auth !== "google") {
    return ok(undefined);
  }

  return getGoogleAccessToken(
    request,
    {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    { fetch, nowMs },
  );
};

/**
 * サインイン中のユーザのカレンダーを読み、今後 30 日の予定をそのまま返す
 *
 * アクセストークンはセッションの JWT から取り出すので、ブラウザには渡らない
 * カレンダーが fake のときはトークンを使わず、種になっている予定を返す
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  const nowMs = Date.now();
  const runtime = getSecretaryRuntime();
  const token = await resolveAccessToken(request, runtime.sources.auth, nowMs);

  if (!token.ok) {
    return errorResponse(token.error);
  }

  const deps = secretaryDepsFor({
    now: isoAt(nowMs),
    ...(token.value === undefined ? {} : { googleAccessToken: token.value }),
  });
  const events = await deps.calendar.listEvents({
    from: isoAt(nowMs),
    to: isoAt(nowMs + SCAN_WINDOW_DAYS * DAY_MS),
  });

  if (!events.ok) {
    return errorResponse(events.error);
  }

  const body: ScanResponse = { events: [...events.value] };

  return Response.json(body);
};
