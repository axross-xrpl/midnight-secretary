import { describe, expect, expectTypeOf, test } from "vitest";
import type { SecretaryError } from "@/application/errors";
import type { PlainFailureKey } from "./failure-message";
import { failureMessageOf } from "./failure-message";

const BUDGET = { amount: 20560, currency: "MST" };

const TOTAL = { amount: 57000, currency: "MST" };

const CAP = { amount: 50000, currency: "MST" };

const SPENT = { amount: 29440, currency: "MST" };

// SecretaryError の source x kind をすべて並べた型 (テストでだけ条件型を使う)
type SecretaryErrorKey<E extends SecretaryError = SecretaryError> = E extends E
  ? `${E["source"]}.${E["error"]["kind"]}`
  : never;

type ExpectedFailureKey =
  | SecretaryErrorKey
  | "unauthorized"
  | "invalid_request"
  | "network"
  | "schema"
  | "unknown";

describe("failureMessageOf", () => {
  test("ブラウザ側の失敗は同じ名前の plain キーになる", () => {
    expect(failureMessageOf({ code: "network" })).toStrictEqual({
      kind: "plain",
      key: "network",
    });
    expect(failureMessageOf({ code: "schema" })).toStrictEqual({
      kind: "plain",
      key: "schema",
    });
  });

  test("封筒の失敗も同じ名前の plain キーになる", () => {
    expect(failureMessageOf({ code: "unauthorized" })).toStrictEqual({
      kind: "plain",
      key: "unauthorized",
    });
    expect(
      failureMessageOf({ code: "invalid_request", issues: [] }),
    ).toStrictEqual({ kind: "plain", key: "invalid_request" });
    expect(failureMessageOf({ code: "unknown" })).toStrictEqual({
      kind: "plain",
      key: "unknown",
    });
  });

  test("use case の失敗は source と kind をつないだ plain キーになる", () => {
    expect(
      failureMessageOf({
        code: "secretary",
        error: {
          source: "planner",
          error: { kind: "notATrip", reason: "出張ではない" },
        },
      }),
    ).toStrictEqual({ kind: "plain", key: "planner.notATrip" });
  });

  test("非公開に対応していない支払い枠の失敗も plain キーになる", () => {
    expect(
      failureMessageOf({
        code: "secretary",
        error: {
          source: "flow",
          error: { kind: "privateSettlementUnsupported", tripId: "trip-1" },
        },
      }),
    ).toStrictEqual({
      kind: "plain",
      key: "flow.privateSettlementUnsupported",
    });
  });

  test("plan.overBudget は予算と合計を持つ variant になる", () => {
    expect(
      failureMessageOf({
        code: "secretary",
        error: {
          source: "plan",
          error: { kind: "overBudget", budget: BUDGET, total: TOTAL },
        },
      }),
    ).toStrictEqual({ kind: "planOverBudget", budget: BUDGET, total: TOTAL });
  });

  test("mandate.overBudget は上限、使用済み、請求額を持つ variant になる", () => {
    expect(
      failureMessageOf({
        code: "secretary",
        error: {
          source: "mandate",
          error: {
            kind: "overBudget",
            cap: CAP,
            spent: SPENT,
            requested: TOTAL,
          },
        },
      }),
    ).toStrictEqual({
      kind: "mandateOverBudget",
      cap: CAP,
      spent: SPENT,
      requested: TOTAL,
    });
  });

  test("overBudget なのに金額が読めなければ schema になる", () => {
    expect(
      failureMessageOf({
        code: "secretary",
        error: { source: "plan", error: { kind: "overBudget" } },
      }),
    ).toStrictEqual({ kind: "plain", key: "schema" });
  });

  test("生年月日の不足と identity / profile の失敗は plain キーになる", () => {
    expect(
      failureMessageOf({
        code: "secretary",
        error: {
          source: "flow",
          error: { kind: "birthDateMissing", tripId: "trip-1" },
        },
      }),
    ).toStrictEqual({ kind: "plain", key: "flow.birthDateMissing" });
    expect(
      failureMessageOf({
        code: "secretary",
        error: { source: "identity", error: { kind: "notRegistered" } },
      }),
    ).toStrictEqual({ kind: "plain", key: "identity.notRegistered" });
    expect(
      failureMessageOf({
        code: "secretary",
        error: { source: "profile", error: { kind: "unavailable" } },
      }),
    ).toStrictEqual({ kind: "plain", key: "profile.unavailable" });
  });

  test("知らない source と kind は unknown になる", () => {
    expect(
      failureMessageOf({
        code: "secretary",
        error: { source: "midnight", error: { kind: "proofServerDown" } },
      }),
    ).toStrictEqual({ kind: "plain", key: "unknown" });
  });
});

describe("メッセージのキー", () => {
  test("plain キーと 2 つの overBudget で SecretaryError と封筒の失敗をすべて覆う", () => {
    expectTypeOf<
      PlainFailureKey | "plan.overBudget" | "mandate.overBudget"
    >().toEqualTypeOf<ExpectedFailureKey>();
  });
});
