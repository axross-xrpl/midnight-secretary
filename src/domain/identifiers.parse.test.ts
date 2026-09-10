import { describe, expect, test } from "vitest";
import {
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseMandateId,
  parseOfferId,
  parsePaymentRef,
  parseTripId,
  parseUserId,
  parseWalletAddress,
} from "./identifiers.parse";

const nonEmptyParsers = [
  { name: "parseUserId", parse: parseUserId, field: "userId" },

  {
    name: "parseCalendarEventId",
    parse: parseCalendarEventId,
    field: "calendarEventId",
  },

  { name: "parseOfferId", parse: parseOfferId, field: "offerId" },

  { name: "parseMandateId", parse: parseMandateId, field: "mandateId" },

  { name: "parsePaymentRef", parse: parsePaymentRef, field: "paymentRef" },

  {
    name: "parseWalletAddress",
    parse: parseWalletAddress,
    field: "walletAddress",
  },
] as const;

describe("空でない文字列を受け入れる parse 関数", () => {
  test.each(nonEmptyParsers)(
    "$name は空でない文字列を受け入れ、空文字を拒否する",
    ({ parse, field }) => {
      expect(parse("value-1")).toStrictEqual({ ok: true, value: "value-1" });
      expect(parse("")).toStrictEqual({
        ok: false,
        error: { kind: "invalid", field, value: "" },
      });
    },
  );
});

describe("parseTripId", () => {
  test("UUID 形式を受け入れる", () => {
    const raw = "0c6e7dbb-2f0e-4a37-9f0a-9a1f4a1c6f11";

    expect(parseTripId(raw)).toStrictEqual({ ok: true, value: raw });
  });

  test("大文字の UUID も受け入れる", () => {
    const raw = "0C6E7DBB-2F0E-4A37-9F0A-9A1F4A1C6F11";

    expect(parseTripId(raw)).toStrictEqual({ ok: true, value: raw });
  });

  test("UUID でない文字列は拒否する", () => {
    expect(parseTripId("trip-1")).toStrictEqual({
      ok: false,
      error: { kind: "invalid", field: "tripId", value: "trip-1" },
    });
  });
});

describe("parseIsoDateTime", () => {
  test("オフセット付きの日時を受け入れる", () => {
    const raw = "2026-09-16T15:00:00+09:00";

    expect(parseIsoDateTime(raw)).toStrictEqual({ ok: true, value: raw });
  });

  test("T の無い日付だけの文字列は拒否する", () => {
    expect(parseIsoDateTime("2026-09-16")).toStrictEqual({
      ok: false,
      error: { kind: "invalid", field: "isoDateTime", value: "2026-09-16" },
    });
  });

  test("Date が読めない文字列は拒否する", () => {
    expect(parseIsoDateTime("いつか")).toStrictEqual({
      ok: false,
      error: { kind: "invalid", field: "isoDateTime", value: "いつか" },
    });
  });
});

describe("parseIsoDate", () => {
  test("YYYY-MM-DD を受け入れる", () => {
    expect(parseIsoDate("2026-09-16")).toStrictEqual({
      ok: true,
      value: "2026-09-16",
    });
  });

  test("存在しない 2 月 30 日は拒否する", () => {
    expect(parseIsoDate("2026-02-30")).toStrictEqual({
      ok: false,
      error: { kind: "invalid", field: "isoDate", value: "2026-02-30" },
    });
  });

  test("平年の 2 月 29 日は拒否する", () => {
    expect(parseIsoDate("2026-02-29")).toStrictEqual({
      ok: false,
      error: { kind: "invalid", field: "isoDate", value: "2026-02-29" },
    });
  });

  test("時刻付きの文字列は拒否する", () => {
    expect(parseIsoDate("2026-09-16T00:00:00Z")).toStrictEqual({
      ok: false,
      error: {
        kind: "invalid",
        field: "isoDate",
        value: "2026-09-16T00:00:00Z",
      },
    });
  });
});

describe("parseAmount", () => {
  test("0 以上の整数を受け入れる", () => {
    expect(parseAmount(0)).toStrictEqual({ ok: true, value: 0 });
    expect(parseAmount(14720)).toStrictEqual({ ok: true, value: 14720 });
  });

  test("負の金額は拒否する", () => {
    expect(parseAmount(-1)).toStrictEqual({
      ok: false,
      error: { kind: "invalid", field: "amount", value: -1 },
    });
  });

  test("小数と安全でない整数は拒否する", () => {
    expect(parseAmount(1.5)).toStrictEqual({
      ok: false,
      error: { kind: "invalid", field: "amount", value: 1.5 },
    });
    expect(parseAmount(Number.MAX_SAFE_INTEGER + 2)).toStrictEqual({
      ok: false,
      error: {
        kind: "invalid",
        field: "amount",
        value: Number.MAX_SAFE_INTEGER + 2,
      },
    });
  });
});
