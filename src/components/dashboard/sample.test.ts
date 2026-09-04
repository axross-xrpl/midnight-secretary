import { describe, expect, test } from "vitest";
import { isDefined } from "@/lib/array";
import { checkPayment } from "./flow";
import {
  sampleEvents,
  sampleLedger,
  sampleMandate,
  samplePlanFor,
} from "./sample";
import { addDays } from "./time";

const NOW = "2026-09-04T00:00:00.000Z";

describe("sample data", () => {
  test("every event falls within the next 14 days", () => {
    const horizon = Date.parse(addDays(NOW, 14));

    const outside = sampleEvents(NOW).filter((event) => {
      return (
        Date.parse(event.start) < Date.parse(NOW) ||
        Date.parse(event.end) > horizon
      );
    });

    expect(outside).toStrictEqual([]);
  });

  test("every trip event has a plan whose total is the sum of its items", () => {
    const plans = sampleEvents(NOW).map(samplePlanFor).filter(isDefined);

    expect(plans).toHaveLength(3);

    const mismatched = plans.filter((plan) => {
      const sum = plan.items.reduce(
        (total, item) => total + item.price.amount,
        0,
      );

      return sum !== plan.total.amount;
    });

    expect(mismatched).toStrictEqual([]);
  });

  test("non-trip events have no plan", () => {
    const others = sampleEvents(NOW).filter((event) => {
      return event.classification.kind === "other";
    });

    expect(others.map(samplePlanFor)).toStrictEqual([undefined, undefined]);
  });

  test("the Sapporo plan alone exceeds the remaining allowance", () => {
    const mandate = sampleMandate(NOW);
    const sapporo = sampleEvents(NOW).find(
      (event) => event.id === "evt-sapporo",
    );
    const plan = sapporo === undefined ? undefined : samplePlanFor(sapporo);

    expect(plan).toBeDefined();
    expect(checkPayment(mandate, plan?.total ?? mandate.cap, NOW)?.kind).toBe(
      "overBudget",
    );
  });

  test("the ledger starts with one commitment and no authorizations", () => {
    const mandate = sampleMandate(NOW);

    expect(sampleLedger(mandate)).toStrictEqual({
      commitments: [{ mandateId: mandate.id, commitment: mandate.commitment }],
      authorizationHashes: [],
      authorizedCount: 0,
    });
  });
});
