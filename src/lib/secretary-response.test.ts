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

const DEMO_150K = { amount: 150000, currency: "MST" };

const DEMO_57K = { amount: 57000, currency: "MST" };

const DEMO_20K = { amount: 20560, currency: "MST" };

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
        price: { amount: 14720, currency: "MST" },
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
        price: { amount: 14720, currency: "MST" },
      },
      total: { amount: 29440, currency: "MST" },
      rationale: "日帰りで往復できる",
    },
    proposedAt: "2026-09-10T00:00:00Z",
    approvedAt: "2026-09-10T00:01:00Z",
    visibility: { outbound: "public", inbound: "private" },
    authorizations: [
      {
        mandateId: "mandate-1",
        paymentRef: `trip:${tripIdAt(1)}:rail-tokyo-osaka`,
        amount: { amount: 14720, currency: "MST" },
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

// 非公開に選んだ支払いの応答 (送金の kind だけが違う)
const SHIELDED_PAYLOAD = {
  data: {
    ...APPROVED_PAYLOAD.data,
    authorizations: APPROVED_PAYLOAD.data.authorizations.map(
      (authorization) => ({
        ...authorization,
        settlement: { ...authorization.settlement, kind: "shieldedTransfer" },
      }),
    ),
  },
};

// visibility を落とした応答 (スキーマが必須として弾くことを確かめる)
const WITHOUT_VISIBILITY = {
  data: Object.fromEntries(
    Object.entries(APPROVED_PAYLOAD.data).filter(
      ([key]) => key !== "visibility",
    ),
  ),
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

// 居酒屋つきの計画と、承認のときに通った成人の証明
const APPROVED_WITH_PROOF_PAYLOAD = {
  data: {
    ...APPROVED_PAYLOAD.data,
    plan: {
      ...APPROVED_PAYLOAD.data.plan,
      dining: {
        id: "restaurant-izakaya-tenma",
        kind: "restaurant",
        payee: "wallet-service",
        name: "天満 立ち飲み居酒屋 大和",
        city: "大阪",
        genre: "居酒屋",
        price: { amount: 3000, currency: "MST" },
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      total: { amount: 32440, currency: "MST" },
    },
    visibility: { outbound: "public", inbound: "private", dining: "private" },
    ageProof: {
      identity: "identity:user-1",
      cutoffDate: "2006-09-15",
      proofRef: "proof-1",
      provedAt: "2026-09-10T00:01:00Z",
    },
  },
};

// 居酒屋とレジャーつきの計画 (成人の証明も持つ)
const APPROVED_WITH_LEISURE_PAYLOAD = {
  data: {
    ...APPROVED_WITH_PROOF_PAYLOAD.data,
    plan: {
      ...APPROVED_WITH_PROOF_PAYLOAD.data.plan,
      leisure: {
        id: "leisure-inbound-guide-tour",
        kind: "leisure",
        payee: "wallet-service",
        name: "訪日外国人限定 大阪ガイドツアー",
        city: "大阪",
        genre: "tour",
        price: { amount: 3500, currency: "MST" },
        requiredVerifications: ["nationality"],
      },
      total: { amount: 35940, currency: "MST" },
    },
    visibility: {
      outbound: "public",
      inbound: "private",
      dining: "private",
      leisure: "private",
    },
  },
};

// 年齢確認が通らず、居酒屋の無い計画に作り直した提案
const REVISED_PAYLOAD = {
  data: {
    status: "proposed",
    id: APPROVED_PAYLOAD.data.id,
    event: APPROVED_PAYLOAD.data.event,
    plan: APPROVED_PAYLOAD.data.plan,
    proposedAt: "2026-09-10T00:01:00Z",
    revision: {
      reason: {
        kind: "ageNotVerified",
        ageLimit: 20,
        cutoffDate: "2006-09-15",
      },
      previous: {
        plan: APPROVED_WITH_PROOF_PAYLOAD.data.plan,
        proposedAt: "2026-09-10T00:00:00Z",
        visibility: {
          outbound: "public",
          inbound: "private",
          dining: "private",
        },
      },
      revisedAt: "2026-09-10T00:01:00Z",
    },
  },
};

// 作り直した提案を承認したもの (記録は承認以降も残る)
const APPROVED_REVISED_PAYLOAD = {
  data: { ...APPROVED_PAYLOAD.data, revision: REVISED_PAYLOAD.data.revision },
};

// 居酒屋つきの提案のまま、年齢の証明が通らなかった記録を付けたもの
const AGE_REJECTED_PAYLOAD = {
  data: {
    status: "proposed",
    id: APPROVED_PAYLOAD.data.id,
    event: APPROVED_PAYLOAD.data.event,
    plan: APPROVED_WITH_PROOF_PAYLOAD.data.plan,
    proposedAt: "2026-09-10T00:00:00Z",
    failedAgeCheck: {
      ageLimit: 20,
      cutoffDate: "2006-09-15",
      visibility: { outbound: "public", inbound: "private", dining: "private" },
      checkedAt: "2026-09-10T00:01:00Z",
    },
  },
};

describe("parseTripResponse", () => {
  test("status の無い応答は拒否する", () => {
    const parsed = parseTripResponse({ data: { id: "trip-1" } });

    expect(parsed.ok).toBe(false);
  });

  test("authorizations を持つ承認済みの応答を通す", () => {
    const parsed = parseTripResponse(APPROVED_PAYLOAD);

    expect(parsed).toStrictEqual({ ok: true, value: APPROVED_PAYLOAD.data });
  });

  test("shieldedTransfer の送金も通す", () => {
    const parsed = parseTripResponse(SHIELDED_PAYLOAD);

    expect(parsed).toStrictEqual({ ok: true, value: SHIELDED_PAYLOAD.data });
  });

  test("visibility の無い承認済みの応答は拒否する", () => {
    const parsed = parseTripResponse(WITHOUT_VISIBILITY);

    expect(parsed.ok).toBe(false);
  });

  test("飲食と成人の証明を持つ承認済みの応答を通す", () => {
    const parsed = parseTripResponse(APPROVED_WITH_PROOF_PAYLOAD);

    expect(parsed).toStrictEqual({
      ok: true,
      value: APPROVED_WITH_PROOF_PAYLOAD.data,
    });
  });

  test("レジャーを持つ承認済みの応答を通す", () => {
    const parsed = parseTripResponse(APPROVED_WITH_LEISURE_PAYLOAD);

    expect(parsed).toStrictEqual({
      ok: true,
      value: APPROVED_WITH_LEISURE_PAYLOAD.data,
    });
  });

  test("知らない本人確認の種類を持つ飲食は拒否する", () => {
    const parsed = parseTripResponse({
      data: {
        ...APPROVED_WITH_PROOF_PAYLOAD.data,
        plan: {
          ...APPROVED_WITH_PROOF_PAYLOAD.data.plan,
          dining: {
            ...APPROVED_WITH_PROOF_PAYLOAD.data.plan.dining,
            requiredVerifications: ["passport"],
          },
        },
      },
    });

    expect(parsed.ok).toBe(false);
  });

  test("作り直しの記録を持つ提案を通す", () => {
    const parsed = parseTripResponse(REVISED_PAYLOAD);

    expect(parsed).toStrictEqual({ ok: true, value: REVISED_PAYLOAD.data });
  });

  test("作り直しの記録は承認済みの応答でも残る", () => {
    const parsed = parseTripResponse(APPROVED_REVISED_PAYLOAD);

    expect(parsed).toStrictEqual({
      ok: true,
      value: APPROVED_REVISED_PAYLOAD.data,
    });
  });

  test("知らない作り直しの理由は拒否する", () => {
    const parsed = parseTripResponse({
      data: {
        ...REVISED_PAYLOAD.data,
        revision: {
          ...REVISED_PAYLOAD.data.revision,
          reason: {
            kind: "overBudget",
            ageLimit: 20,
            cutoffDate: "2006-09-15",
          },
        },
      },
    });

    expect(parsed.ok).toBe(false);
  });

  test("年齢の証明が通らなかった記録を持つ提案を通す", () => {
    const parsed = parseTripResponse(AGE_REJECTED_PAYLOAD);

    expect(parsed).toStrictEqual({
      ok: true,
      value: AGE_REJECTED_PAYLOAD.data,
    });
  });

  test("公開範囲の無い証明の記録は拒否する", () => {
    const parsed = parseTripResponse({
      data: {
        ...AGE_REJECTED_PAYLOAD.data,
        failedAgeCheck: {
          ageLimit: 20,
          cutoffDate: "2006-09-15",
          checkedAt: "2026-09-10T00:01:00Z",
        },
      },
    });

    expect(parsed.ok).toBe(false);
  });
});

describe("parsePlanOverBudget", () => {
  test("plan.overBudget からは予算と合計を返す", () => {
    expect(
      parsePlanOverBudget({
        source: "plan",
        error: { kind: "overBudget", budget: DEMO_20K, total: DEMO_57K },
      }),
    ).toStrictEqual({
      ok: true,
      value: { budget: DEMO_20K, total: DEMO_57K },
    });
  });

  test("kind が違えばスキーマの失敗", () => {
    expect(
      parsePlanOverBudget({
        source: "plan",
        error: { kind: "lodgingNotAllowed" },
      }).ok,
    ).toBe(false);
  });

  test("合計が無ければスキーマの失敗", () => {
    expect(
      parsePlanOverBudget({
        source: "plan",
        error: { kind: "overBudget", budget: DEMO_20K },
      }).ok,
    ).toBe(false);
  });

  test("source が mandate ならスキーマの失敗", () => {
    expect(
      parsePlanOverBudget({
        source: "mandate",
        error: { kind: "overBudget", budget: DEMO_20K, total: DEMO_57K },
      }).ok,
    ).toBe(false);
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
    ).toStrictEqual({
      ok: true,
      value: { cap: DEMO_150K, spent: DEMO_20K, requested: DEMO_57K },
    });
  });

  test("kind が違えばスキーマの失敗", () => {
    expect(
      parseMandateOverBudget({
        source: "mandate",
        error: { kind: "expired" },
      }).ok,
    ).toBe(false);
  });

  test("請求額が無ければスキーマの失敗", () => {
    expect(
      parseMandateOverBudget({
        source: "mandate",
        error: { kind: "overBudget", cap: DEMO_150K, spent: DEMO_20K },
      }).ok,
    ).toBe(false);
  });

  test("source が plan ならスキーマの失敗", () => {
    expect(
      parseMandateOverBudget({
        source: "plan",
        error: {
          kind: "overBudget",
          cap: DEMO_150K,
          spent: DEMO_20K,
          requested: DEMO_57K,
        },
      }).ok,
    ).toBe(false);
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
