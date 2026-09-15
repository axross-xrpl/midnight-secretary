import { describe, expect, test } from "vitest";
import {
  approveTripBodySchema,
  proposeTripBodySchema,
  setUpMandateBodySchema,
  writeBackBodySchema,
} from "./secretary-request";

describe("setUpMandateBodySchema", () => {
  test("上限と期限と用途を受け付ける", () => {
    const parsed = setUpMandateBodySchema.safeParse({
      cap: 200000,
      expiresAt: "2026-12-31T23:59:59+09:00",
      purpose: "出張手配",
    });

    expect(parsed.success).toBe(true);
  });

  test("数値でない上限は拒否する", () => {
    const parsed = setUpMandateBodySchema.safeParse({
      cap: "200000",
      expiresAt: "2026-12-31T23:59:59+09:00",
      purpose: "出張手配",
    });

    expect(parsed.success).toBe(false);
  });

  test("余分なキーは拒否する", () => {
    const parsed = setUpMandateBodySchema.safeParse({
      cap: 200000,
      expiresAt: "2026-12-31T23:59:59+09:00",
      purpose: "出張手配",
      currency: "MST",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("proposeTripBodySchema", () => {
  test("予定 id と locale を受け付ける", () => {
    const parsed = proposeTripBodySchema.safeParse({
      eventId: "seed-2",
      locale: "ja",
    });

    expect(parsed.success).toBe(true);
  });

  test("locale が無ければ拒否する", () => {
    const parsed = proposeTripBodySchema.safeParse({ eventId: "seed-2" });

    expect(parsed.success).toBe(false);
  });

  test("知らない locale は拒否する", () => {
    const parsed = proposeTripBodySchema.safeParse({
      eventId: "seed-2",
      locale: "fr",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("approveTripBodySchema", () => {
  test("公開範囲と locale を受け付ける", () => {
    const parsed = approveTripBodySchema.safeParse({
      visibility: { lodging: "private" },
      locale: "ja",
    });

    expect(parsed.success).toBe(true);
  });

  test("locale が無ければ拒否する", () => {
    const parsed = approveTripBodySchema.safeParse({ visibility: {} });

    expect(parsed.success).toBe(false);
  });

  test("知らない locale は拒否する", () => {
    const parsed = approveTripBodySchema.safeParse({
      visibility: {},
      locale: "fr",
    });

    expect(parsed.success).toBe(false);
  });

  test("余分なキーは拒否する", () => {
    const parsed = approveTripBodySchema.safeParse({
      visibility: {},
      locale: "ja",
      tripId: "trip-1",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("writeBackBodySchema", () => {
  test("locale を受け付ける", () => {
    const parsed = writeBackBodySchema.safeParse({ locale: "en" });

    expect(parsed.success).toBe(true);
  });

  test("余分なキーは拒否する", () => {
    const parsed = writeBackBodySchema.safeParse({
      locale: "en",
      title: "上書き",
    });

    expect(parsed.success).toBe(false);
  });
});
