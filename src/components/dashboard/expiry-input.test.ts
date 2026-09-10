import { describe, expect, test } from "vitest";
import type { MandateFormValues } from "./expiry-input";
import {
  buildSetUpMandateBody,
  defaultExpiryInput,
  isoDateTimeFromLocalInput,
} from "./expiry-input";

const NOW = "2026-09-10T00:00:00Z";

const VALID: MandateFormValues = {
  cap: "100000",
  expiresAt: "2026-10-10T09:00",
  purpose: "  9 月の出張  ",
};

describe("defaultExpiryInput", () => {
  test("30 日後の JST を datetime-local の形で返す", () => {
    expect(defaultExpiryInput(NOW)).toBe("2026-10-10T09:00");
  });
});

describe("isoDateTimeFromLocalInput", () => {
  test("分までの入力には秒とオフセットを足す", () => {
    expect(isoDateTimeFromLocalInput("2026-10-10T09:00")).toBe(
      "2026-10-10T09:00:00+09:00",
    );
  });

  test("秒までの入力にはオフセットだけ足す", () => {
    expect(isoDateTimeFromLocalInput("2026-10-10T09:00:30")).toBe(
      "2026-10-10T09:00:30+09:00",
    );
  });

  test("空文字は undefined", () => {
    expect(isoDateTimeFromLocalInput("")).toBeUndefined();
  });

  test("日付だけの入力は undefined", () => {
    expect(isoDateTimeFromLocalInput("2026-10-10")).toBeUndefined();
  });
});

describe("buildSetUpMandateBody", () => {
  test("受理した入力は用途を trim して body にする", () => {
    expect(buildSetUpMandateBody(VALID, NOW)).toStrictEqual({
      ok: true,
      value: {
        cap: 100000,
        expiresAt: "2026-10-10T09:00:00+09:00",
        purpose: "9 月の出張",
      },
    });
  });

  test("上限が 0 なら cap の不備", () => {
    expect(buildSetUpMandateBody({ ...VALID, cap: "0" }, NOW)).toStrictEqual({
      ok: false,
      error: { field: "cap" },
    });
  });

  test("上限が整数でなければ cap の不備", () => {
    expect(buildSetUpMandateBody({ ...VALID, cap: "12.5" }, NOW)).toStrictEqual(
      {
        ok: false,
        error: { field: "cap" },
      },
    );
  });

  test("上限が空なら cap の不備", () => {
    expect(buildSetUpMandateBody({ ...VALID, cap: "" }, NOW)).toStrictEqual({
      ok: false,
      error: { field: "cap" },
    });
  });

  test("期限が空なら expiresAt の不備", () => {
    expect(
      buildSetUpMandateBody({ ...VALID, expiresAt: "" }, NOW),
    ).toStrictEqual({ ok: false, error: { field: "expiresAt" } });
  });

  test("期限が now より前なら expiresAt の不備", () => {
    expect(
      buildSetUpMandateBody({ ...VALID, expiresAt: "2026-09-01T09:00" }, NOW),
    ).toStrictEqual({ ok: false, error: { field: "expiresAt" } });
  });

  test("用途が空白だけなら purpose の不備", () => {
    expect(
      buildSetUpMandateBody({ ...VALID, purpose: "   " }, NOW),
    ).toStrictEqual({ ok: false, error: { field: "purpose" } });
  });
});
