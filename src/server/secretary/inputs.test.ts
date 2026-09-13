import { describe, expect, test } from "vitest";
import {
  parseProposeTripInput,
  parseSetUpMandateInput,
  parseTripIdParam,
  parseWriteBackInput,
} from "./inputs";

const TRIP_ID = "3f0f5a3e-9f4a-4a1e-8a3d-2b7c1f9a0e11";

describe("parseSetUpMandateInput", () => {
  test("上限をデモ用トークンの金額にして下書きを作る", () => {
    expect(
      parseSetUpMandateInput({
        cap: 200000,
        expiresAt: "2026-12-31T23:59:59+09:00",
        purpose: "出張手配",
      }),
    ).toStrictEqual({
      ok: true,
      value: {
        cap: { amount: 200000, currency: "MST" },
        expiresAt: "2026-12-31T23:59:59+09:00",
        purpose: "出張手配",
      },
    });
  });

  test("負の上限は amount の schema の失敗になる", () => {
    expect(
      parseSetUpMandateInput({
        cap: -1,
        expiresAt: "2026-12-31T23:59:59+09:00",
        purpose: "出張手配",
      }),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "schema",
        issues: [{ path: ["amount"], message: "invalid" }],
      },
    });
  });

  test("時刻を持たない期限は isoDateTime の schema の失敗になる", () => {
    expect(
      parseSetUpMandateInput({
        cap: 200000,
        expiresAt: "2026-12-31",
        purpose: "出張手配",
      }),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "schema",
        issues: [{ path: ["isoDateTime"], message: "invalid" }],
      },
    });
  });
});

describe("parseProposeTripInput", () => {
  test("予定 id と locale に brand を付ける", () => {
    expect(
      parseProposeTripInput({ eventId: "seed-2", locale: "ja" }),
    ).toStrictEqual({
      ok: true,
      value: { eventId: "seed-2", locale: "ja" },
    });
  });

  test("空の予定 id は calendarEventId の schema の失敗になる", () => {
    expect(parseProposeTripInput({ eventId: "", locale: "ja" })).toStrictEqual({
      ok: false,
      error: {
        kind: "schema",
        issues: [{ path: ["calendarEventId"], message: "invalid" }],
      },
    });
  });
});

describe("parseWriteBackInput", () => {
  test("locale を取り出す", () => {
    expect(parseWriteBackInput({ locale: "en" })).toStrictEqual({
      ok: true,
      value: { locale: "en" },
    });
  });
});

describe("parseTripIdParam", () => {
  test("UUID は TripId になる", () => {
    expect(parseTripIdParam(TRIP_ID)).toStrictEqual({
      ok: true,
      value: TRIP_ID,
    });
  });

  test("UUID でなければ tripId の schema の失敗になる", () => {
    expect(parseTripIdParam("trip-1")).toStrictEqual({
      ok: false,
      error: {
        kind: "schema",
        issues: [{ path: ["tripId"], message: "invalid" }],
      },
    });
  });
});
