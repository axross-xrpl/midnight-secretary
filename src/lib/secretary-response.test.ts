import { describe, expect, expectTypeOf, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { Mandate } from "@/domain/mandate";
import type { ApprovedTrip, Trip } from "@/domain/trip";
import type { MandateResponse, TripResponse } from "./secretary-response";
import {
  parseMandateOverBudget,
  parsePlanOverBudget,
  parseSecretaryFailure,
  parseTripResponse,
} from "./secretary-response";

const DEMO_150K = { amount: 150000, currency: "DEMO" };

const DEMO_57K = { amount: 57000, currency: "DEMO" };

const DEMO_20K = { amount: 20560, currency: "DEMO" };

const APPROVED_PAYLOAD = {
  data: {
    status: "approved",
    id: tripIdAt(1),
    event: {
      id: "seed-2",
      title: "大阪出張 (取引先訪問)",
      when: {
        kind: "timed",
        start: "2026-09-15T10:00:00+09:00",
        end: "2026-09-15T17:00:00+09:00",
      },
    },
    plan: {
      intent: {
        destination: "大阪",
        departOn: "2026-09-15",
        returnOn: "2026-09-15",
        purpose: "取引先訪問",
      },
      outbound: {
        id: "rail-tokyo-osaka",
        mode: "rail",
        vendor: "デモ鉄道",
        payee: "wallet-rail",
        origin: "東京",
        destination: "新大阪",
        departAt: "2026-09-15T09:00:00+09:00",
        arriveAt: "2026-09-15T11:30:00+09:00",
        price: { amount: 14720, currency: "DEMO" },
      },
      inbound: {
        id: "rail-osaka-tokyo",
        mode: "rail",
        vendor: "デモ鉄道",
        payee: "wallet-rail",
        origin: "新大阪",
        destination: "東京",
        departAt: "2026-09-15T18:00:00+09:00",
        arriveAt: "2026-09-15T20:30:00+09:00",
        price: { amount: 14720, currency: "DEMO" },
      },
      total: { amount: 29440, currency: "DEMO" },
      rationale: "日帰りで往復できる",
    },
    proposedAt: "2026-09-10T00:00:00Z",
    approvedAt: "2026-09-10T00:01:00Z",
    authorizations: [
      {
        mandateId: "mandate-1",
        paymentRef: `trip:${tripIdAt(1)}:rail-tokyo-osaka`,
        amount: { amount: 14720, currency: "DEMO" },
        authorizedAt: "2026-09-10T00:02:00Z",
        publicHash: "hash:mandate-1:rail-tokyo-osaka",
        settlement: {
          kind: "tokenTransfer",
          transactionId: "tx-1",
          recipient: "wallet-rail",
        },
      },
    ],
  },
};

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

  test("authorizations を持つ承認済みの応答を通す", () => {
    const parsed = parseTripResponse(APPROVED_PAYLOAD);

    expect(parsed).toStrictEqual({ ok: true, value: APPROVED_PAYLOAD.data });
  });
});

describe("parsePlanOverBudget", () => {
  test("plan.overBudget からは予算と合計を返す", () => {
    expect(
      parsePlanOverBudget({
        source: "plan",
        error: { kind: "overBudget", budget: DEMO_20K, total: DEMO_57K },
      }),
    ).toStrictEqual({ budget: DEMO_20K, total: DEMO_57K });
  });

  test("kind が違えば undefined", () => {
    expect(
      parsePlanOverBudget({
        source: "plan",
        error: { kind: "lodgingNotAllowed" },
      }),
    ).toBeUndefined();
  });

  test("合計が無ければ undefined", () => {
    expect(
      parsePlanOverBudget({
        source: "plan",
        error: { kind: "overBudget", budget: DEMO_20K },
      }),
    ).toBeUndefined();
  });

  test("source が mandate なら undefined", () => {
    expect(
      parsePlanOverBudget({
        source: "mandate",
        error: { kind: "overBudget", budget: DEMO_20K, total: DEMO_57K },
      }),
    ).toBeUndefined();
  });
});

describe("parseMandateOverBudget", () => {
  test("mandate.overBudget からは上限、使用済み、請求額を返す", () => {
    expect(
      parseMandateOverBudget({
        source: "mandate",
        error: {
          kind: "overBudget",
          cap: DEMO_150K,
          spent: DEMO_20K,
          requested: DEMO_57K,
        },
      }),
    ).toStrictEqual({ cap: DEMO_150K, spent: DEMO_20K, requested: DEMO_57K });
  });

  test("kind が違えば undefined", () => {
    expect(
      parseMandateOverBudget({
        source: "mandate",
        error: { kind: "expired" },
      }),
    ).toBeUndefined();
  });

  test("請求額が無ければ undefined", () => {
    expect(
      parseMandateOverBudget({
        source: "mandate",
        error: { kind: "overBudget", cap: DEMO_150K, spent: DEMO_20K },
      }),
    ).toBeUndefined();
  });

  test("source が plan なら undefined", () => {
    expect(
      parseMandateOverBudget({
        source: "plan",
        error: {
          kind: "overBudget",
          cap: DEMO_150K,
          spent: DEMO_20K,
          requested: DEMO_57K,
        },
      }),
    ).toBeUndefined();
  });
});

describe("応答の型と domain の型", () => {
  test("domain の値はそのまま応答の型に代入できる (brand は string と number の部分型)", () => {
    expectTypeOf<Trip>().toExtend<TripResponse>();
    expectTypeOf<Mandate>().toExtend<MandateResponse>();
  });

  test("readonly の authorizations を持つ承認済みの出張も代入できる", () => {
    expectTypeOf<ApprovedTrip>().toExtend<TripResponse>();
  });
});
