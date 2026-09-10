import { describe, expect, test } from "vitest";
import { sequentialTripIds } from "@/testing/ids";
import type { SecretaryContext } from "@/adapters/auth/session";
import {
  createFakeCalendar,
  seedCalendarEvents,
} from "@/adapters/calendar/fake";
import { createFakeCatalog, seedCatalog } from "@/adapters/catalog/fake";
import type { FakeMandateIds } from "@/adapters/mandate/fake";
import { createFakeMandate } from "@/adapters/mandate/fake";
import { createFakePlanner } from "@/adapters/planner/fake";
import { createFakeStore } from "@/adapters/store/fake";
import type { SecretaryDeps } from "@/application/deps";
import { setUpMandate } from "@/application/secretary";
import type {
  CalendarEventId,
  IsoDateTime,
  MandateId,
  UserId,
} from "@/domain/identifiers";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDateTime,
  parseMandateId,
  parseUserId,
} from "@/domain/identifiers.parse";
import type { MandateDraft } from "@/domain/mandate";
import type { SecretaryStore } from "@/domain/store";
import type { Result } from "@/lib/result";
import { err } from "@/lib/result";
import { dashboardRange, loadDashboardData } from "./dashboard-page";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const NOW = at("2026-09-09T00:00:00Z");

const USER: UserId = mustParse(parseUserId("user-1"));

const CAP = 150000;

const testEventIds = (): (() => CalendarEventId) => {
  const state = { issued: 0 };

  return () => {
    state.issued = state.issued + 1;

    return mustParse(parseCalendarEventId(`written-${state.issued}`));
  };
};

const testMandateIds = (): FakeMandateIds => {
  const state = { issued: 0, sent: 0 };

  return {
    newMandateId: (): MandateId => {
      state.issued = state.issued + 1;

      return mustParse(parseMandateId(`mandate-${state.issued}`));
    },
    newCommitment: () => `commitment-${state.issued}`,
    newTransactionId: () => {
      state.sent = state.sent + 1;

      return `tx-${state.sent}`;
    },
    hashAuthorization: (id, ref) => `hash:${id}:${ref}`,
  };
};

// Fake は状態を持つので、テストごとに組み直す
const testContext = (): SecretaryContext => {
  const deps: SecretaryDeps = {
    calendar: createFakeCalendar({
      events: seedCalendarEvents(NOW),
      newEventId: testEventIds(),
    }),
    catalog: createFakeCatalog(seedCatalog()),
    planner: createFakePlanner(),
    mandate: createFakeMandate({ mandates: [], ids: testMandateIds() }),
    store: createFakeStore(),
    newTripId: sequentialTripIds(),
  };

  return { userId: USER, deps, now: NOW };
};

// listTrips だけを失敗させ、他は Fake に委譲する
const failingTrips = (store: SecretaryStore): SecretaryStore => {
  return {
    ...store,
    listTrips: async () => err({ kind: "unavailable", cause: "stub" }),
  };
};

const withFailingStore = (context: SecretaryContext): SecretaryContext => {
  return {
    ...context,
    deps: { ...context.deps, store: failingTrips(context.deps.store) },
  };
};

const DRAFT: MandateDraft = {
  cap: { amount: mustParse(parseAmount(CAP)), currency: "DEMO" },
  expiresAt: at("2026-12-31T23:59:59+09:00"),
  purpose: "9 月の出張",
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

describe("dashboardRange", () => {
  test("now から 30 日先までの半開区間になる", () => {
    expect(dashboardRange(NOW)).toStrictEqual({
      from: "2026-09-09T00:00:00Z",
      to: "2026-10-09T00:00:00.000Z",
    });
  });
});

describe("loadDashboardData", () => {
  test("mandate が無いユーザには seed の予定と空の台帳を返す", async () => {
    const context = testContext();

    const data = mustOk(await loadDashboardData(context));

    expect(data.now).toBe(NOW);
    expect(data.mandate).toBeUndefined();
    expect(data.events.map((event) => event.id)).toStrictEqual([
      "seed-1",
      "seed-2",
      "seed-4",
      "seed-3",
    ]);
    expect(data.trips).toStrictEqual([]);
    expect(data.publicLedger).toStrictEqual({
      commitments: [],
      authorizations: [],
      authorizedCount: 0,
    });
  });

  test("支払い枠を作った後は mandate とコミットメント 1 件を返す", async () => {
    const context = testContext();
    mustOk(
      await setUpMandate(context.userId, DRAFT, context.now, context.deps),
    );

    const data = mustOk(await loadDashboardData(context));

    expect(data.mandate?.cap).toStrictEqual({ amount: CAP, currency: "DEMO" });
    expect(data.mandate?.spent).toStrictEqual({ amount: 0, currency: "DEMO" });
    expect(data.publicLedger.commitments).toStrictEqual([
      { mandateId: "mandate-1", commitment: "commitment-1" },
    ]);
  });

  test("store の読み取りが失敗したらその失敗を返す", async () => {
    const context = withFailingStore(testContext());

    expect(await loadDashboardData(context)).toStrictEqual({
      ok: false,
      error: { source: "store", error: { kind: "unavailable", cause: "stub" } },
    });
  });
});
