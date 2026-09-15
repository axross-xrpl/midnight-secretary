import { describe, expect, expectTypeOf, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { TripStatus } from "@/domain/trip";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type {
  MandateResponse,
  MoneyResponse,
  PaymentVisibilityResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
import {
  effectiveTrip,
  INITIAL_FLOW_STATE,
  reduceFlow,
  STATUS_ORDER,
  STEP_ORDER,
  stepIndexOf,
} from "./flow";
import type { FlowState, Stage } from "./flow";
import type { RequestFailure, Step } from "./types";

const TRIP_ID = tripIdAt(1);

const NETWORK_FAILURE: RequestFailure = { code: "network" };

const OSAKA: ScanEvent = {
  id: "seed-2",
  title: "大阪出張 (取引先訪問)",
  when: {
    kind: "timed",
    start: "2026-09-15T10:00:00+09:00",
    end: "2026-09-15T17:00:00+09:00",
  },
};

const mst = (amount: number): MoneyResponse => {
  return { amount, currency: "MST" };
};

const RAIL = {
  id: "rail-tokyo-osaka",
  mode: "rail",
  vendor: "デモ鉄道",
  payee: "wallet-rail",
  origin: "東京",
  destination: "新大阪",
  departAt: "2026-09-15T09:00:00+09:00",
  arriveAt: "2026-09-15T11:30:00+09:00",
  price: mst(14720),
} as const;

const PLAN: TripPlanResponse = {
  intent: {
    destination: "大阪",
    departOn: "2026-09-15",
    returnOn: "2026-09-15",
    purpose: "取引先訪問",
  },
  outbound: RAIL,
  inbound: { ...RAIL, id: "rail-osaka-tokyo" },
  total: mst(29440),
  rationale: "日帰りで往復できる",
};

const MANDATE: MandateResponse = {
  id: "mandate-1",
  cap: mst(200000),
  spent: mst(0),
  expiresAt: "2026-10-13T00:00:00.000Z",
  purpose: "出張の手配",
  commitment: "commitment-1",
};

const ALL_PUBLIC: PaymentVisibilityResponse = {
  outbound: "public",
  inbound: "public",
};

const BASE = {
  id: TRIP_ID,
  event: OSAKA,
  plan: PLAN,
  proposedAt: "2026-09-10T00:00:00Z",
};

const PROPOSED: TripResponse = { status: "proposed", ...BASE };

const APPROVED: TripResponse = {
  status: "approved",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [],
};

const PAID: TripResponse = {
  status: "paid",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [],
  paidAt: "2026-09-10T00:02:00Z",
};

const WRITTEN: TripResponse = {
  status: "written",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [],
  paidAt: "2026-09-10T00:02:00Z",
  writtenEventId: "written-1",
  writtenAt: "2026-09-10T00:03:00Z",
};

const busyState = (step: Step): FlowState => {
  return { ...INITIAL_FLOW_STATE, activity: { kind: "busy", step } };
};

const CONSENT_STATE: FlowState = {
  ...INITIAL_FLOW_STATE,
  activity: { kind: "awaitingConsent" },
};

describe("reduceFlow", () => {
  test("一本道では 1 手ごとに fresh が進む", () => {
    const proposing = reduceFlow(INITIAL_FLOW_STATE, {
      type: "start",
      step: "propose",
    });

    expect(proposing).toStrictEqual({
      activity: { kind: "busy", step: "propose" },
      visibility: {},
    });

    const proposed = reduceFlow(proposing, { type: "succeed", trip: PROPOSED });

    expect(proposed).toStrictEqual({
      activity: { kind: "idle" },
      fresh: PROPOSED,
      visibility: {},
    });

    const approving = reduceFlow(proposed, { type: "start", step: "approve" });

    expect(approving.activity).toStrictEqual({
      kind: "busy",
      step: "approve",
    });

    const approved = reduceFlow(approving, { type: "succeed", trip: APPROVED });

    expect(approved.fresh).toStrictEqual(APPROVED);

    const paying = reduceFlow(approved, { type: "start", step: "pay" });
    const paid = reduceFlow(paying, { type: "succeed", trip: PAID });

    expect(paid.fresh).toStrictEqual(PAID);

    const writing = reduceFlow(paid, { type: "start", step: "writeBack" });
    const written = reduceFlow(writing, { type: "succeed", trip: WRITTEN });

    expect(written).toStrictEqual({
      activity: { kind: "idle" },
      fresh: WRITTEN,
      visibility: {},
    });
  });

  test("進行中は start で状態が変わらない", () => {
    const busy = busyState("propose");

    expect(reduceFlow(busy, { type: "start", step: "approve" })).toBe(busy);
  });

  test("進行中でなければ succeed / fail で状態が変わらない", () => {
    expect(
      reduceFlow(INITIAL_FLOW_STATE, { type: "succeed", trip: PROPOSED }),
    ).toBe(INITIAL_FLOW_STATE);
    expect(
      reduceFlow(INITIAL_FLOW_STATE, {
        type: "fail",
        failure: NETWORK_FAILURE,
      }),
    ).toBe(INITIAL_FLOW_STATE);
  });

  test("fail は進行中の 1 手を引き継ぎ、dismiss で消える", () => {
    const failed = reduceFlow(busyState("pay"), {
      type: "fail",
      failure: NETWORK_FAILURE,
    });

    expect(failed.activity).toStrictEqual({
      kind: "failed",
      step: "pay",
      failure: NETWORK_FAILURE,
    });

    expect(reduceFlow(failed, { type: "dismiss" })).toStrictEqual({
      activity: { kind: "idle" },
      visibility: {},
    });
  });

  test("失敗していなければ dismiss で状態が変わらない", () => {
    expect(reduceFlow(INITIAL_FLOW_STATE, { type: "dismiss" })).toBe(
      INITIAL_FLOW_STATE,
    );
  });

  test("mandateCreated は提案の途中 (busy) でも支払い枠を覚える", () => {
    const created = reduceFlow(busyState("propose"), {
      type: "mandateCreated",
      mandate: MANDATE,
    });

    expect(created).toStrictEqual({
      activity: { kind: "busy", step: "propose" },
      createdMandate: MANDATE,
      visibility: {},
    });

    const failed = reduceFlow(created, {
      type: "fail",
      failure: NETWORK_FAILURE,
    });

    expect(failed.createdMandate).toStrictEqual(MANDATE);
    expect(
      reduceFlow(failed, { type: "dismiss" }).createdMandate,
    ).toStrictEqual(MANDATE);
  });

  test("setVisibility は候補ごとに公開範囲を覚え、他の候補を消さない", () => {
    const lodging = reduceFlow(INITIAL_FLOW_STATE, {
      type: "setVisibility",
      category: "lodging",
      value: "private",
    });

    expect(lodging.visibility).toStrictEqual({ lodging: "private" });

    const both = reduceFlow(lodging, {
      type: "setVisibility",
      category: "outbound",
      value: "private",
    });

    expect(both.visibility).toStrictEqual({
      lodging: "private",
      outbound: "private",
    });

    const backToPublic = reduceFlow(both, {
      type: "setVisibility",
      category: "lodging",
      value: "public",
    });

    expect(backToPublic.visibility).toStrictEqual({
      lodging: "public",
      outbound: "private",
    });
  });

  test("askConsent は休止中からだけ返事待ちに入る", () => {
    expect(
      reduceFlow(INITIAL_FLOW_STATE, { type: "askConsent" }),
    ).toStrictEqual({ activity: { kind: "awaitingConsent" }, visibility: {} });

    const busy = busyState("approve");

    expect(reduceFlow(busy, { type: "askConsent" })).toBe(busy);
    expect(reduceFlow(CONSENT_STATE, { type: "askConsent" })).toBe(
      CONSENT_STATE,
    );
  });

  test("declineConsent は返事待ちからだけ休止中に戻り、選択は残る", () => {
    const chosen = reduceFlow(CONSENT_STATE, {
      type: "setVisibility",
      category: "dining",
      value: "private",
    });

    expect(reduceFlow(chosen, { type: "declineConsent" })).toStrictEqual({
      activity: { kind: "idle" },
      visibility: { dining: "private" },
    });
    expect(reduceFlow(INITIAL_FLOW_STATE, { type: "declineConsent" })).toBe(
      INITIAL_FLOW_STATE,
    );
  });

  test("返事待ちからは start で承認が進む", () => {
    expect(
      reduceFlow(CONSENT_STATE, { type: "start", step: "approve" }),
    ).toStrictEqual({
      activity: { kind: "busy", step: "approve" },
      visibility: {},
    });
  });

  test("succeed は次の計画に選択を持ち越さない", () => {
    const chosen = reduceFlow(busyState("approve"), {
      type: "setVisibility",
      category: "lodging",
      value: "private",
    });

    const approved = reduceFlow(chosen, {
      type: "succeed",
      trip: APPROVED,
    });

    expect(approved.visibility).toStrictEqual({});
  });
});

describe("effectiveTrip", () => {
  test("直近の応答があればそれを採る", () => {
    expect(effectiveTrip(PROPOSED, APPROVED)).toBe(APPROVED);
  });

  test("応答が無ければサーバが読んだものを採る", () => {
    expect(effectiveTrip(PROPOSED, undefined)).toBe(PROPOSED);
  });

  test("どちらも無ければ undefined", () => {
    expect(effectiveTrip(undefined, undefined)).toBeUndefined();
  });
});

describe("stepIndexOf", () => {
  test("trip が無い休止状態は提案の段", () => {
    expect(stepIndexOf({ kind: "idle" }, undefined)).toBe(0);
  });

  test("休止状態は status の次の段で、written は全段済み", () => {
    expect(stepIndexOf({ kind: "idle" }, PROPOSED)).toBe(1);
    expect(stepIndexOf({ kind: "idle" }, APPROVED)).toBe(2);
    expect(stepIndexOf({ kind: "idle" }, PAID)).toBe(3);
    expect(stepIndexOf({ kind: "idle" }, WRITTEN)).toBe(4);
  });

  test("証明を送るかの返事待ちは承認の段", () => {
    expect(stepIndexOf({ kind: "awaitingConsent" }, PROPOSED)).toBe(1);
  });

  test("進行中と失敗はその 1 手の段", () => {
    expect(stepIndexOf({ kind: "busy", step: "propose" }, PROPOSED)).toBe(0);
    expect(stepIndexOf({ kind: "busy", step: "pay" }, APPROVED)).toBe(2);
    expect(
      stepIndexOf(
        { kind: "failed", step: "writeBack", failure: NETWORK_FAILURE },
        PAID,
      ),
    ).toBe(3);
  });

  test("組み直しは承認の段", () => {
    expect(stepIndexOf({ kind: "busy", step: "replan" }, PROPOSED)).toBe(1);
    expect(
      stepIndexOf(
        { kind: "failed", step: "replan", failure: NETWORK_FAILURE },
        PROPOSED,
      ),
    ).toBe(1);
  });
});

describe("STATUS_ORDER と STEP_ORDER", () => {
  test("domain の TripStatus と段を進む順に並べている", () => {
    expect(STATUS_ORDER).toStrictEqual([
      "proposed",
      "approved",
      "paid",
      "written",
    ]);
    expect(STEP_ORDER).toStrictEqual([
      "propose",
      "approve",
      "pay",
      "writeBack",
    ]);
    expectTypeOf<(typeof STATUS_ORDER)[number]>().toEqualTypeOf<TripStatus>();
    expectTypeOf<(typeof STEP_ORDER)[number]>().toEqualTypeOf<Stage>();
  });

  test("段はどれも 1 手で、組み直しだけが段に無い", () => {
    expectTypeOf<Stage>().toExtend<Step>();
    expectTypeOf<"replan">().toExtend<Step>();
    expectTypeOf<"replan">().not.toExtend<Stage>();
  });
});
