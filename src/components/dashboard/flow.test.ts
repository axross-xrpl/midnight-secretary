import { describe, expect, test } from "vitest";
import {
  appendAuthorization,
  applyPayment,
  checkPayment,
  isBusy,
  paymentRefFor,
  reduceFlow,
  remainingAllowance,
  sampleAuthorization,
  sampleHash,
  shortHash,
} from "./flow";
import type {
  CalendarEventView,
  FlowState,
  MandateView,
  PublicLedgerView,
  TripPlanView,
} from "./types";

const NOW = "2026-09-04T00:00:00.000Z";

const mandate: MandateView = {
  id: "m1",
  cap: { amount: 150_000, currency: "JPY" },
  spent: { amount: 20_000, currency: "JPY" },
  expiresAt: "2026-10-04T00:00:00.000Z",
  purpose: "trips",
  commitment: "0xabc",
};

const event: CalendarEventView = {
  id: "e1",
  title: "Osaka",
  start: "2026-09-07T04:00:00.000Z",
  end: "2026-09-07T08:00:00.000Z",
  allDay: false,
  classification: { kind: "trip", destination: "Osaka" },
};

const plan: TripPlanView = {
  id: "p1",
  eventId: "e1",
  destination: "Osaka",
  items: [],
  total: { amount: 41_440, currency: "JPY" },
  rationale: "because",
};

describe("remainingAllowance", () => {
  test("subtracts spent from cap", () => {
    expect(remainingAllowance(mandate)).toStrictEqual({
      amount: 130_000,
      currency: "JPY",
    });
  });
});

describe("checkPayment", () => {
  test("allows a payment within the remaining allowance", () => {
    expect(checkPayment(mandate, plan.total, NOW)).toBeUndefined();
  });

  test("rejects a payment above the remaining allowance", () => {
    const requested = { amount: 130_001, currency: "JPY" } as const;

    expect(checkPayment(mandate, requested, NOW)).toStrictEqual({
      kind: "overBudget",
      remaining: { amount: 130_000, currency: "JPY" },
      requested,
    });
  });

  test("rejects a payment after the mandate expired", () => {
    expect(checkPayment(mandate, plan.total, mandate.expiresAt)).toStrictEqual({
      kind: "expired",
      expiresAt: mandate.expiresAt,
    });
  });
});

describe("applyPayment and appendAuthorization", () => {
  test("applyPayment adds to spent without touching the cap", () => {
    expect(applyPayment(mandate, plan.total)).toStrictEqual({
      ...mandate,
      spent: { amount: 61_440, currency: "JPY" },
    });
  });

  test("appendAuthorization records the hash and increments the count", () => {
    const ledger: PublicLedgerView = {
      commitments: [{ mandateId: "m1", commitment: "0xabc" }],
      authorizationHashes: [],
      authorizedCount: 0,
    };

    expect(appendAuthorization(ledger, "0xdef")).toStrictEqual({
      ...ledger,
      authorizationHashes: ["0xdef"],
      authorizedCount: 1,
    });
  });
});

describe("hashes and references", () => {
  test("paymentRefFor is derived from the plan id", () => {
    expect(paymentRefFor("p1")).toBe("pay:p1");
  });

  test("sampleHash is deterministic and 64 hex digits", () => {
    expect(sampleHash("x")).toBe(sampleHash("x"));
    expect(sampleHash("x")).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sampleHash("x")).not.toBe(sampleHash("y"));
  });

  test("shortHash keeps the prefix and suffix", () => {
    expect(shortHash("0x0123456789abcdef0123456789abcdef")).toBe(
      "0x01234567...abcdef",
    );
    expect(shortHash("0xshort")).toBe("0xshort");
  });

  test("sampleAuthorization uses the plan total and a deterministic hash", () => {
    const first = sampleAuthorization(plan, mandate.id, NOW);
    const second = sampleAuthorization(plan, mandate.id, NOW);

    expect(first).toStrictEqual(second);
    expect(first.paymentRef).toBe("pay:p1");
    expect(first.amount).toStrictEqual(plan.total);
  });
});

describe("reduceFlow", () => {
  const authorization = sampleAuthorization(plan, mandate.id, NOW);

  test("walks the whole path in order", () => {
    const states: FlowState[] = [{ step: "idle" }];
    const s1 = reduceFlow(states[0] ?? { step: "idle" }, {
      type: "propose",
      event,
    });
    const s2 = reduceFlow(s1, { type: "planReady", plan });
    const s3 = reduceFlow(s2, { type: "approve" });
    const s4 = reduceFlow(s3, { type: "pay" });
    const s5 = reduceFlow(s4, { type: "authorized", authorization });
    const s6 = reduceFlow(s5, { type: "writeBack" });
    const s7 = reduceFlow(s6, { type: "written", calendarEventId: "c1" });

    expect(s1).toStrictEqual({ step: "proposing", event });
    expect(s2).toStrictEqual({ step: "proposed", event, plan });
    expect(s3).toStrictEqual({ step: "approved", event, plan });
    expect(s4).toStrictEqual({ step: "proving", event, plan });
    expect(s5).toStrictEqual({
      step: "authorized",
      event,
      plan,
      authorization,
    });
    expect(s6).toStrictEqual({ step: "writing", event, plan, authorization });
    expect(s7).toStrictEqual({
      step: "written",
      event,
      plan,
      authorization,
      calendarEventId: "c1",
    });
  });

  test("ignores an action that does not fit the current step", () => {
    const proposed: FlowState = { step: "proposed", event, plan };

    expect(reduceFlow(proposed, { type: "pay" })).toBe(proposed);
    expect(reduceFlow({ step: "idle" }, { type: "approve" })).toStrictEqual({
      step: "idle",
    });
  });

  test("records a failure while proving and allows a new proposal after it", () => {
    const proving: FlowState = { step: "proving", event, plan };
    const failed = reduceFlow(proving, {
      type: "failed",
      error: { kind: "proofFailed" },
    });

    expect(failed).toStrictEqual({
      step: "failed",
      event,
      plan,
      error: { kind: "proofFailed" },
    });
    expect(reduceFlow(failed, { type: "propose", event })).toStrictEqual({
      step: "proposing",
      event,
    });
  });

  test("reset returns to idle from any step", () => {
    expect(
      reduceFlow({ step: "approved", event, plan }, { type: "reset" }),
    ).toStrictEqual({ step: "idle" });
  });

  test("isBusy is true only while a background step runs", () => {
    expect(isBusy({ step: "proposing", event })).toBe(true);
    expect(isBusy({ step: "proving", event, plan })).toBe(true);
    expect(isBusy({ step: "proposed", event, plan })).toBe(false);
    expect(isBusy({ step: "idle" })).toBe(false);
  });
});
