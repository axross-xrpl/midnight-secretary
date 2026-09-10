import { describe, expect, expectTypeOf, test } from "vitest";
import type { Mandate } from "@/domain/mandate";
import type { Trip } from "@/domain/trip";
import type { MandateResponse, TripResponse } from "./secretary-response";
import { parseSecretaryFailure, parseTripResponse } from "./secretary-response";

describe("parseSecretaryFailure", () => {
  test("サインインの失敗は unauthorized になる", () => {
    expect(
      parseSecretaryFailure({
        error: { code: "unauthorized", message: "Authentication is required" },
      }),
    ).toStrictEqual({ code: "unauthorized" });
  });

  test("形の失敗は issues をそのまま持つ", () => {
    expect(
      parseSecretaryFailure({
        error: {
          code: "invalid_request",
          message: "The request is invalid",
          issues: [{ path: ["cap"], message: "invalid" }],
        },
      }),
    ).toStrictEqual({
      code: "invalid_request",
      issues: [{ path: ["cap"], message: "invalid" }],
    });
  });

  test("use case の失敗は source と kind を持つ", () => {
    expect(
      parseSecretaryFailure({
        error: {
          code: "secretary",
          message: "flow.noMandate",
          detail: { source: "flow", error: { kind: "noMandate" } },
        },
      }),
    ).toStrictEqual({
      code: "secretary",
      error: { source: "flow", error: { kind: "noMandate" } },
    });
  });

  test("形の合わない応答は unknown になる", () => {
    expect(parseSecretaryFailure({ message: "boom" })).toStrictEqual({
      code: "unknown",
    });
  });
});

describe("parseTripResponse", () => {
  test("status の無い応答は拒否する", () => {
    const parsed = parseTripResponse({ data: { id: "trip-1" } });

    expect(parsed.ok).toBe(false);
  });
});

describe("応答の型と domain の型", () => {
  test("domain の値はそのまま応答の型に代入できる (brand は string と number の部分型)", () => {
    expectTypeOf<Trip>().toExtend<TripResponse>();
    expectTypeOf<Mandate>().toExtend<MandateResponse>();
  });
});
