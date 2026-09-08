import { describe, expect, test } from "vitest";
import type { FetchLike } from "@/lib/http";
import { requestScan } from "./request-scan";

const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), { status });
};

const oneEventScan = {
  events: [
    {
      id: "evt",
      summary: "大阪出張",
      location: "新大阪",
      start: { kind: "timed", dateTime: "2026-09-10T10:00:00+09:00" },
      end: { kind: "timed", dateTime: "2026-09-10T15:00:00+09:00" },
    },
  ],
};

describe("requestScan", () => {
  test("POST /api/calendar/scan の応答をスキャン結果として返す", async () => {
    const fetchStub: FetchLike = async (input, init) => {
      expect(String(input)).toBe("/api/calendar/scan");
      expect(init?.method).toBe("POST");

      return jsonResponse(oneEventScan);
    };

    expect(await requestScan(fetchStub)).toStrictEqual({
      ok: true,
      value: oneEventScan,
    });
  });

  test("失敗応答からは理由を取り出す", async () => {
    const fetchStub: FetchLike = async () => {
      return jsonResponse({ error: { kind: "unauthenticated" } }, 401);
    };

    expect(await requestScan(fetchStub)).toStrictEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  test("形が違う応答は schema になる", async () => {
    const fetchStub: FetchLike = async () => {
      return jsonResponse({ events: "?" });
    };

    expect(await requestScan(fetchStub)).toStrictEqual({
      ok: false,
      error: "schema",
    });
  });

  test("fetch が reject したら network になる", async () => {
    const fetchStub: FetchLike = async () => {
      throw new Error("offline");
    };

    expect(await requestScan(fetchStub)).toStrictEqual({
      ok: false,
      error: "network",
    });
  });
});
