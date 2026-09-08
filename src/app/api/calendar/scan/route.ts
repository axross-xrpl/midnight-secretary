import type { NextRequest } from "next/server";
import type { ScanErrorKind, ScanResponse } from "@/lib/calendar-scan-response";
import type { CalendarError } from "@/lib/google-calendar";
import { listUpcomingEvents } from "@/lib/google-calendar";
import type { GoogleTokenError } from "@/lib/google-token";
import { getGoogleAccessToken } from "@/lib/google-token";

// 参考実装と同じく今日から 30 日先までを見る
const SCAN_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// 失敗の理由ごとに返す HTTP ステータス
const STATUS_BY_KIND = {
  unauthenticated: 401,
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

/**
 * サインイン中のユーザの Google カレンダーを読み、今後 30 日の予定をそのまま返す
 *
 * アクセストークンはセッションの JWT から取り出すので、ブラウザには渡らない
 */
export const POST = async (request: NextRequest): Promise<Response> => {
  const nowMs = Date.now();
  const credentials = {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  };
  const token = await getGoogleAccessToken(request, credentials, {
    fetch,
    nowMs,
  });

  if (!token.ok) {
    return errorResponse(token.error);
  }

  const events = await listUpcomingEvents(
    token.value,
    {
      timeMin: new Date(nowMs).toISOString(),
      timeMax: new Date(nowMs + SCAN_WINDOW_DAYS * DAY_MS).toISOString(),
    },
    { fetch },
  );

  if (!events.ok) {
    return errorResponse(events.error);
  }

  const body: ScanResponse = { events: events.value };

  return Response.json(body);
};
