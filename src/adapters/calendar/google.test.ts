import { describe, expect, test } from "vitest";
import type { DateRange } from "@/domain/calendar";
import {
  mustParse,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import type { FetchLike } from "@/lib/http";
import { createGoogleCalendar, parseEventsPayload } from "./google";

const range: DateRange = {
  from: mustParse(parseIsoDateTime("2026-09-01T00:00:00.000Z")),
  to: mustParse(parseIsoDateTime("2026-10-01T00:00:00.000Z")),
};

const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

const failingFetch: FetchLike = async () => {
  return jsonResponse({}, 500);
};

describe("parseEventsPayload", () => {
  test("events.list の応答を domain の予定に正規化する", () => {
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
          title: "大阪出張",
          location: "新大阪",
          when: {
            kind: "timed",
            start: "2026-09-10T10:00:00+09:00",
            end: "2026-09-10T15:00:00+09:00",
          },
        },

        {
          id: "all-day",
          title: "福岡出張",
          when: {
            kind: "allDay",
            startDate: "2026-09-12",
            endDate: "2026-09-13",
          },
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
          title: "",
          when: {
            kind: "allDay",
            startDate: "2026-09-12",
            endDate: "2026-09-13",
          },
        },
      ],
    });
  });

  test("説明も取り込む", () => {
    const result = parseEventsPayload({
      items: [
        {
          id: "with-description",
          summary: "大阪出張",
          description: "取引先訪問",
          start: { dateTime: "2026-09-10T10:00:00+09:00" },
          end: { dateTime: "2026-09-10T15:00:00+09:00" },
        },
      ],
    });

    expect(result.ok && result.value.at(0)?.description).toBe("取引先訪問");
  });

  test("items が無い応答は空の一覧になる", () => {
    expect(parseEventsPayload({})).toStrictEqual({ ok: true, value: [] });
  });

  test("形が違う応答は schema エラーになる", () => {
    const result = parseEventsPayload({ items: [{ summary: "id が無い" }] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("schema");
  });

  test("日付として読めない予定も schema エラーになる", () => {
    const result = parseEventsPayload({
      items: [
        {
          id: "broken-date",
          summary: "壊れた日付",
          start: { date: "2026-02-30" },
          end: { date: "2026-03-01" },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("schema");
  });
});

describe("listEvents", () => {
  test("アクセストークンを付けて期間指定で取得する", async () => {
    const fetchStub: FetchLike = async (input, init) => {
      const url = new URL(String(input));

      expect(url.origin + url.pathname).toBe(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      expect(url.searchParams.get("timeMin")).toBe(range.from);
      expect(url.searchParams.get("timeMax")).toBe(range.to);
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

    const result = await createGoogleCalendar("token-1", {
      fetch: fetchStub,
    }).listEvents(range);

    expect(result).toStrictEqual({
      ok: true,
      value: [
        {
          id: "evt",
          title: "大阪出張",
          when: {
            kind: "allDay",
            startDate: "2026-09-12",
            endDate: "2026-09-13",
          },
        },
      ],
    });
  });

  test("401 は unauthenticated になる", async () => {
    const fetchStub: FetchLike = async () => {
      return jsonResponse({ error: { code: 401 } }, 401);
    };

    const result = await createGoogleCalendar("expired", {
      fetch: fetchStub,
    }).listEvents(range);

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
      await createGoogleCalendar("token", { fetch: forbidden }).listEvents(
        range,
      ),
    ).toStrictEqual({ ok: false, error: { kind: "forbidden" } });
    expect(
      await createGoogleCalendar("token", { fetch: unavailable }).listEvents(
        range,
      ),
    ).toStrictEqual({ ok: false, error: { kind: "http", status: 503 } });
  });

  test("fetch が reject したら network になる", async () => {
    const cause = new Error("offline");
    const fetchStub: FetchLike = async () => {
      throw cause;
    };

    const result = await createGoogleCalendar("token", {
      fetch: fetchStub,
    }).listEvents(range);

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "network", cause },
    });
  });
});

describe("getEvent", () => {
  test("id を指定して 1 件読み取る", async () => {
    const fetchStub: FetchLike = async (input) => {
      expect(String(input)).toBe(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/evt%201",
      );

      return jsonResponse({
        id: "evt 1",
        summary: "大阪出張",
        start: { dateTime: "2026-09-10T10:00:00+09:00" },
        end: { dateTime: "2026-09-10T15:00:00+09:00" },
      });
    };

    const result = await createGoogleCalendar("token", {
      fetch: fetchStub,
    }).getEvent(mustParse(parseCalendarEventId("evt 1")));

    expect(result).toStrictEqual({
      ok: true,
      value: {
        id: "evt 1",
        title: "大阪出張",
        when: {
          kind: "timed",
          start: "2026-09-10T10:00:00+09:00",
          end: "2026-09-10T15:00:00+09:00",
        },
      },
    });
  });

  test("404 は失敗ではなく undefined になる", async () => {
    const fetchStub: FetchLike = async () => {
      return jsonResponse({ error: { code: 404 } }, 404);
    };

    const result = await createGoogleCalendar("token", {
      fetch: fetchStub,
    }).getEvent(mustParse(parseCalendarEventId("missing")));

    expect(result).toStrictEqual({ ok: true, value: undefined });
  });

  test("その他の失敗はステータスを持つ", async () => {
    const result = await createGoogleCalendar("token", {
      fetch: failingFetch,
    }).getEvent(mustParse(parseCalendarEventId("evt")));

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "http", status: 500 },
    });
  });
});

describe("insertEvent", () => {
  test("件名と開始終了を載せて POST する", async () => {
    const fetchStub: FetchLike = async (input, init) => {
      expect(String(input)).toBe(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toStrictEqual({
        summary: "大阪出張の移動",
        location: "大阪",
        start: { dateTime: "2026-09-14T09:00:00+09:00" },
        end: { dateTime: "2026-09-14T20:30:00+09:00" },
      });

      return jsonResponse({
        id: "written",
        summary: "大阪出張の移動",
        location: "大阪",
        start: { dateTime: "2026-09-14T09:00:00+09:00" },
        end: { dateTime: "2026-09-14T20:30:00+09:00" },
      });
    };

    const result = await createGoogleCalendar("token", {
      fetch: fetchStub,
    }).insertEvent({
      title: "大阪出張の移動",
      location: "大阪",
      when: {
        kind: "timed",
        start: mustParse(parseIsoDateTime("2026-09-14T09:00:00+09:00")),
        end: mustParse(parseIsoDateTime("2026-09-14T20:30:00+09:00")),
      },
    });

    expect(result.ok && result.value.id).toBe("written");
  });

  test("終日の予定は日付だけを送る", async () => {
    const fetchStub: FetchLike = async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toStrictEqual({
        summary: "福岡出張",
        start: { date: "2026-09-21" },
        end: { date: "2026-09-23" },
      });

      return jsonResponse({
        id: "written",
        summary: "福岡出張",
        start: { date: "2026-09-21" },
        end: { date: "2026-09-23" },
      });
    };

    const result = await createGoogleCalendar("token", {
      fetch: fetchStub,
    }).insertEvent({
      title: "福岡出張",
      when: {
        kind: "allDay",
        startDate: mustParse(parseIsoDate("2026-09-21")),
        endDate: mustParse(parseIsoDate("2026-09-23")),
      },
    });

    expect(result.ok && result.value.when).toStrictEqual({
      kind: "allDay",
      startDate: "2026-09-21",
      endDate: "2026-09-23",
    });
  });

  test("書き込みに失敗したらステータスを持つ", async () => {
    const result = await createGoogleCalendar("token", {
      fetch: failingFetch,
    }).insertEvent({
      title: "大阪出張の移動",
      when: {
        kind: "timed",
        start: mustParse(parseIsoDateTime("2026-09-14T09:00:00+09:00")),
        end: mustParse(parseIsoDateTime("2026-09-14T20:30:00+09:00")),
      },
    });

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "http", status: 500 },
    });
  });
});
