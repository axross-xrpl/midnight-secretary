import { describe, expect, test } from "vitest";
import type { FetchLike } from "./http";
import { listUpcomingEvents, parseEventsPayload } from "./google-calendar";

const range = {
  timeMin: "2026-09-01T00:00:00.000Z",
  timeMax: "2026-10-01T00:00:00.000Z",
};

const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

describe("parseEventsPayload", () => {
  test("events.list の応答を一覧に出す形に正規化する", () => {
    const result = parseEventsPayload({
      items: [
        {
          id: "timed",
          summary: "大阪出張",
          location: "新大阪",
          start: { dateTime: "2026-09-10T10:00:00+09:00" },
          end: { dateTime: "2026-09-10T15:00:00+09:00" },
        },

        {
          id: "all-day",
          summary: "福岡出張",
          location: null,
          start: { date: "2026-09-12" },
          end: { date: "2026-09-13" },
        },
      ],
    });

    expect(result).toStrictEqual({
      ok: true,
      value: [
        {
          id: "timed",
          summary: "大阪出張",
          location: "新大阪",
          start: { kind: "timed", dateTime: "2026-09-10T10:00:00+09:00" },
          end: { kind: "timed", dateTime: "2026-09-10T15:00:00+09:00" },
        },

        {
          id: "all-day",
          summary: "福岡出張",
          start: { kind: "allDay", date: "2026-09-12" },
          end: { kind: "allDay", date: "2026-09-13" },
        },
      ],
    });
  });

  test("件名が無い予定は空文字にし、開始か終了が無い予定は捨てる", () => {
    const result = parseEventsPayload({
      items: [
        {
          id: "no-summary",
          start: { date: "2026-09-12" },
          end: { date: "2026-09-13" },
        },

        { id: "no-end", summary: "壊れた予定", start: { date: "2026-09-12" } },
      ],
    });

    expect(result).toStrictEqual({
      ok: true,
      value: [
        {
          id: "no-summary",
          summary: "",
          start: { kind: "allDay", date: "2026-09-12" },
          end: { kind: "allDay", date: "2026-09-13" },
        },
      ],
    });
  });

  test("items が無い応答は空の一覧になる", () => {
    expect(parseEventsPayload({})).toStrictEqual({ ok: true, value: [] });
  });

  test("形が違う応答は schema エラーになる", () => {
    const result = parseEventsPayload({ items: [{ summary: "id が無い" }] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("schema");
  });
});

describe("listUpcomingEvents", () => {
  test("アクセストークンを付けて期間指定で取得する", async () => {
    const fetchStub: FetchLike = async (input, init) => {
      const url = new URL(String(input));

      expect(url.origin + url.pathname).toBe(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      expect(url.searchParams.get("timeMin")).toBe(range.timeMin);
      expect(url.searchParams.get("timeMax")).toBe(range.timeMax);
      expect(url.searchParams.get("singleEvents")).toBe("true");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer token-1",
      );

      return jsonResponse({
        items: [
          {
            id: "evt",
            summary: "大阪出張",
            start: { date: "2026-09-12" },
            end: { date: "2026-09-13" },
          },
        ],
      });
    };

    const result = await listUpcomingEvents("token-1", range, {
      fetch: fetchStub,
    });

    expect(result).toStrictEqual({
      ok: true,
      value: [
        {
          id: "evt",
          summary: "大阪出張",
          start: { kind: "allDay", date: "2026-09-12" },
          end: { kind: "allDay", date: "2026-09-13" },
        },
      ],
    });
  });

  test("401 は unauthenticated になる", async () => {
    const fetchStub: FetchLike = async () => {
      return jsonResponse({ error: { code: 401 } }, 401);
    };

    const result = await listUpcomingEvents("expired", range, {
      fetch: fetchStub,
    });

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "unauthenticated" },
    });
  });

  test("403 は forbidden になり、その他の失敗はステータスを持つ", async () => {
    const forbidden: FetchLike = async () => {
      return jsonResponse({}, 403);
    };
    const unavailable: FetchLike = async () => {
      return jsonResponse({}, 503);
    };

    expect(
      await listUpcomingEvents("token", range, { fetch: forbidden }),
    ).toStrictEqual({ ok: false, error: { kind: "forbidden" } });
    expect(
      await listUpcomingEvents("token", range, { fetch: unavailable }),
    ).toStrictEqual({ ok: false, error: { kind: "http", status: 503 } });
  });

  test("fetch が reject したら network になる", async () => {
    const cause = new Error("offline");
    const fetchStub: FetchLike = async () => {
      throw cause;
    };

    const result = await listUpcomingEvents("token", range, {
      fetch: fetchStub,
    });

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "network", cause },
    });
  });
});
