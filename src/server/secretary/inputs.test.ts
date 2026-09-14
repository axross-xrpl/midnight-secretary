import { describe, expect, test } from "vitest";
import {
  parseApproveTripInput,
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

describe("parseApproveTripInput", () => {
  test("候補ごとの公開範囲を取り出す", () => {
    expect(
      parseApproveTripInput({
        visibility: { outbound: "public", lodging: "private" },
      }),
    ).toStrictEqual({
      ok: true,
      value: { outbound: "public", lodging: "private" },
    });
  });

  test("すべて省いた指定も通す (指定の無い候補は use case が公開にする)", () => {
    expect(parseApproveTripInput({ visibility: {} })).toStrictEqual({
      ok: true,
      value: {},
    });
  });

  test("visibility が無い body は schema の失敗になる", () => {
    expect(parseApproveTripInput({}).ok).toBe(false);
  });

  test("知らない公開範囲は schema の失敗になる", () => {
    expect(
      parseApproveTripInput({ visibility: { outbound: "secret" } }).ok,
    ).toBe(false);
  });

  test("飲食の公開範囲も取り出す", () => {
    expect(
      parseApproveTripInput({ visibility: { dining: "private" } }),
    ).toStrictEqual({ ok: true, value: { dining: "private" } });
  });

  test("レジャーの公開範囲も取り出す", () => {
    expect(
      parseApproveTripInput({
        visibility: { dining: "private", leisure: "private" },
      }),
    ).toStrictEqual({
      ok: true,
      value: { dining: "private", leisure: "private" },
    });
  });

  test("知らない候補は schema の失敗になる", () => {
    expect(
      parseApproveTripInput({ visibility: { breakfast: "private" } }).ok,
    ).toBe(false);
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
