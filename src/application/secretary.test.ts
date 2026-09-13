import { describe, expect, test } from "vitest";
import { sequentialTripIds, UNKNOWN_TRIP_ID } from "@/testing/ids";
import {
  createFakeCalendar,
  seedCalendarEvents,
} from "@/adapters/calendar/fake";
import { createFakeCatalog, seedCatalog } from "@/adapters/catalog/fake";
import type { FakeMandateIds } from "@/adapters/mandate/fake";
import { createFakeMandate } from "@/adapters/mandate/fake";
import { createFakePlanner } from "@/adapters/planner/fake";
import { createFakeStore } from "@/adapters/store/fake";
import type { LodgingOffer } from "@/domain/catalog";
import type {
  CalendarEventId,
  IsoDateTime,
  MandateId,
  TripId,
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
import type { Mandate, MandateDraft, MandatePort } from "@/domain/mandate";
import { paymentRefFor } from "@/domain/mandate.parse";
import type { Money } from "@/domain/money";
import type { TripPlan } from "@/domain/plan";
import type { ApprovedTrip, PaidTrip, ProposedTrip, Trip } from "@/domain/trip";
import type { Result } from "@/lib/result";
import { err } from "@/lib/result";
import type { SecretaryDeps } from "./deps";
import { WAVE1_PREFERENCES } from "./preferences";
import type { ProposeTripInput, RenderEventText } from "./secretary";
import {
  approveTrip,
  loadDashboard,
  loadLedgerViews,
  payForTrip,
  proposeTrip,
  setUpMandate,
  writeBackTrip,
} from "./secretary";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const eventId = (raw: string): CalendarEventId => {
  return mustParse(parseCalendarEventId(raw));
};

const mandateId = (raw: string): MandateId => {
  return mustParse(parseMandateId(raw));
};

const userId = (raw: string): UserId => {
  return mustParse(parseUserId(raw));
};

const NOW = at("2026-09-09T00:00:00Z");

const EXPIRES_AT = at("2026-12-31T23:59:59+09:00");

const USER = userId("user-1");

// 30 日の窓は seed の予定 4 件すべてを含む
const RANGE = { from: NOW, to: at("2026-10-09T00:00:00Z") };

// 取引先訪問は日帰り、展示会は 1 泊、チーム定例は出張ではない
const OSAKA_EVENT = eventId("seed-2");

const OVERNIGHT_EVENT = eventId("seed-3");

const MEETING_EVENT = eventId("seed-1");

// seedCatalog の価格から計算した合計 (鉄道優先なので ひかり505号 と のぞみ232号 の往復、1 泊は なんばホテルC)
const OSAKA_TOTAL = 14400 + 14520;

const OVERNIGHT_TOTAL = 14400 + 14520 + 12500;

const ENOUGH_CAP = 200000;

const testEventIds = (): (() => CalendarEventId) => {
  const state = { issued: 0 };

  return () => {
    state.issued = state.issued + 1;

    return eventId(`written-${state.issued}`);
  };
};

const testMandateIds = (): FakeMandateIds => {
  const state = { issued: 0, sent: 0 };

  return {
    newMandateId: () => {
      state.issued = state.issued + 1;

      return mandateId(`mandate-${state.issued}`);
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
const testDeps = (): SecretaryDeps => {
  return {
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
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

const approvedOf = (trip: Trip): ApprovedTrip => {
  if (trip.status !== "approved") {
    throw new Error(`test: expected approved but was ${trip.status}`);
  }

  return trip;
};

const lodgingOf = (plan: TripPlan): LodgingOffer => {
  if (plan.lodging === undefined) {
    throw new Error("test: expected a lodging offer");
  }

  return plan.lodging;
};

const draftFor = (cap: number): MandateDraft => {
  return { cap: mst(cap), expiresAt: EXPIRES_AT, purpose: "出張手配" };
};

const proposeInput = (event: CalendarEventId): ProposeTripInput => {
  return {
    userId: USER,
    eventId: event,
    locale: "ja",
    preferences: WAVE1_PREFERENCES,
    now: NOW,
  };
};

const renderText: RenderEventText = (trip) => {
  return {
    title: `${trip.plan.intent.destination} 出張`,
    description: `合計 ${trip.plan.total.amount} ${trip.plan.total.currency}`,
  };
};

const mustSetUpMandate = async (
  deps: SecretaryDeps,
  cap: number,
): Promise<Mandate> => {
  return mustOk(await setUpMandate(USER, draftFor(cap), NOW, deps));
};

const mustPropose = async (
  deps: SecretaryDeps,
  event: CalendarEventId,
): Promise<ProposedTrip> => {
  return mustOk(await proposeTrip(proposeInput(event), deps));
};

const mustApprove = async (
  deps: SecretaryDeps,
  id: TripId,
): Promise<ApprovedTrip> => {
  return mustOk(await approveTrip(USER, id, NOW, deps));
};

const mustPay = async (deps: SecretaryDeps, id: TripId): Promise<PaidTrip> => {
  return mustOk(await payForTrip(USER, id, NOW, deps));
};

const storedTrip = async (deps: SecretaryDeps, id: TripId): Promise<Trip> => {
  const trip = mustOk(await deps.store.getTrip(USER, id));

  if (trip === undefined) {
    throw new Error("test: the trip is missing from the store");
  }

  return trip;
};

// 2 件目の支払いだけ失敗させ、他は Fake に委譲する
const failsAtSecondPayment = (mandate: MandatePort): MandatePort => {
  const state = { calls: 0 };

  return {
    ...mandate,
    authorizePayment: async (request) => {
      state.calls = state.calls + 1;

      if (state.calls === 2) {
        return err({ kind: "unavailable", cause: "stub" });
      }

      return mandate.authorizePayment(request);
    },
  };
};

describe("loadDashboard", () => {
  test("mandate が無ければ省き、期間内の予定を返す", async () => {
    const deps = testDeps();

    const dashboard = mustOk(await loadDashboard(USER, RANGE, deps));

    expect(dashboard.events).toHaveLength(4);
    expect(dashboard.trips).toStrictEqual([]);
    expect("mandate" in dashboard).toBe(false);
  });

  test("mandate を作った後は mandate が入る", async () => {
    const deps = testDeps();
    const mandate = await mustSetUpMandate(deps, ENOUGH_CAP);

    const dashboard = mustOk(await loadDashboard(USER, RANGE, deps));

    expect(dashboard.mandate).toStrictEqual(mandate);
  });

  test("提案した trip が trips に入る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const trip = await mustPropose(deps, OSAKA_EVENT);

    const dashboard = mustOk(await loadDashboard(USER, RANGE, deps));

    expect(dashboard.trips).toStrictEqual([trip]);
  });
});

describe("setUpMandate", () => {
  test("作成した mandate をリンクし、spent は 0 になる", async () => {
    const deps = testDeps();

    const mandate = mustOk(
      await setUpMandate(USER, draftFor(ENOUGH_CAP), NOW, deps),
    );

    expect(mandate.spent).toStrictEqual(mst(0));
    expect(await deps.store.getMandateLink(USER)).toStrictEqual({
      ok: true,
      value: { mandateId: mandate.id, linkedAt: NOW },
    });
  });

  test("2 回目は mandateExists になる", async () => {
    const deps = testDeps();
    const mandate = await mustSetUpMandate(deps, ENOUGH_CAP);

    expect(
      await setUpMandate(USER, draftFor(ENOUGH_CAP), NOW, deps),
    ).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: { kind: "mandateExists", mandateId: mandate.id },
      },
    });
  });
});

describe("proposeTrip", () => {
  test("日帰りの予定は宿なしで、合計が rail の往復になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const trip = await mustPropose(deps, OSAKA_EVENT);

    expect(trip.status).toBe("proposed");
    expect(trip.event.id).toBe("seed-2");
    expect(trip.proposedAt).toBe(NOW);
    expect(trip.plan.outbound.id).toBe("rail-hikari-505");
    expect(trip.plan.inbound.id).toBe("rail-nozomi-232");
    expect(trip.plan.lodging).toBeUndefined();
    expect(trip.plan.total).toStrictEqual(mst(OSAKA_TOTAL));
  });

  test("1 泊の予定は宿が付き、合計に 1 泊分が入る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const trip = await mustPropose(deps, OVERNIGHT_EVENT);

    expect(lodgingOf(trip.plan).id).toBe("hotel-namba-c");
    expect(lodgingOf(trip.plan).price).toStrictEqual(mst(12500));
    expect(trip.plan.total).toStrictEqual(mst(OVERNIGHT_TOTAL));
  });

  test("出張ではない予定は planner の notATrip になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);

    expect(await proposeTrip(proposeInput(MEETING_EVENT), deps)).toStrictEqual({
      ok: false,
      error: {
        source: "planner",
        error: {
          kind: "notATrip",
          reason: "no known destination in title or location",
        },
      },
    });
  });

  test("知らない予定 id は eventNotFound になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);

    expect(
      await proposeTrip(proposeInput(eventId("seed-9")), deps),
    ).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: { kind: "eventNotFound", eventId: "seed-9" },
      },
    });
  });

  test("mandate が無ければ noMandate になる", async () => {
    const deps = testDeps();

    expect(await proposeTrip(proposeInput(OSAKA_EVENT), deps)).toStrictEqual({
      ok: false,
      error: { source: "flow", error: { kind: "noMandate" } },
    });
  });

  test("残り予算で賄えなければ plan の overBudget になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, 20000);

    expect(await proposeTrip(proposeInput(OSAKA_EVENT), deps)).toStrictEqual({
      ok: false,
      error: {
        source: "plan",
        error: {
          kind: "overBudget",
          budget: mst(20000),
          total: mst(OSAKA_TOTAL),
        },
      },
    });
  });

  test("同じ予定への 2 回目の提案は同じ id で上書きする", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const first = await mustPropose(deps, OSAKA_EVENT);
    const second = await mustPropose(deps, OSAKA_EVENT);

    expect(second.id).toBe(first.id);
    expect(mustOk(await deps.store.listTrips(USER))).toHaveLength(1);
  });

  test("承認済みの予定への提案は eventAlreadyArranged になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    await mustApprove(deps, proposed.id);

    expect(await proposeTrip(proposeInput(OSAKA_EVENT), deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: {
          kind: "eventAlreadyArranged",
          eventId: OSAKA_EVENT,
          tripId: proposed.id,
        },
      },
    });
  });
});

describe("approveTrip", () => {
  test("提案済みを承認すると authorizations が空で始まる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    const approved = await mustApprove(deps, proposed.id);

    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).toBe(NOW);
    expect(approved.authorizations).toStrictEqual([]);
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(approved);
  });

  test("知らない trip id は tripNotFound になる", async () => {
    const deps = testDeps();
    const unknown = UNKNOWN_TRIP_ID;

    expect(await approveTrip(USER, unknown, NOW, deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: { kind: "tripNotFound", tripId: unknown },
      },
    });
  });

  test("承認済みをもう一度承認すると wrongStatus になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    await mustApprove(deps, proposed.id);

    expect(await approveTrip(USER, proposed.id, NOW, deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: {
          kind: "wrongStatus",
          tripId: proposed.id,
          expected: "proposed",
          actual: "approved",
        },
      },
    });
  });
});

describe("payForTrip", () => {
  test("1 泊の出張は往路、復路、宿の順に 3 件支払う", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    await mustApprove(deps, proposed.id);

    const paid = await mustPay(deps, proposed.id);

    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBe(NOW);
    expect(
      paid.authorizations.map((authorization) => authorization.paymentRef),
    ).toStrictEqual([
      paymentRefFor(paid.id, paid.plan.outbound.id),
      paymentRefFor(paid.id, paid.plan.inbound.id),
      paymentRefFor(paid.id, lodgingOf(paid.plan).id),
    ]);
    expect(
      paid.authorizations.map(
        (authorization) => authorization.settlement.recipient,
      ),
    ).toStrictEqual([
      "mn_shield-addr_test1demo-transport-seller",
      "mn_shield-addr_test1demo-transport-seller",
      "mn_shield-addr_test1demo-service-seller",
    ]);

    const ledger = mustOk(await loadLedgerViews(USER, deps));

    expect(ledger.privateMandate?.spent).toStrictEqual(mst(OVERNIGHT_TOTAL));
  });

  test("日帰りの出張は往路と復路の 2 件で済む", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    await mustApprove(deps, proposed.id);

    const paid = await mustPay(deps, proposed.id);

    expect(paid.authorizations).toHaveLength(2);
  });

  test("提案済みのままでは wrongStatus になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    expect(await payForTrip(USER, proposed.id, NOW, deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: {
          kind: "wrongStatus",
          tripId: proposed.id,
          expected: "approved",
          actual: "proposed",
        },
      },
    });
  });

  test("途中で失敗すると approved のまま済んだ分だけ残り、再試行で最後まで進む", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    await mustApprove(deps, proposed.id);

    const failing = { ...deps, mandate: failsAtSecondPayment(deps.mandate) };

    expect(await payForTrip(USER, proposed.id, NOW, failing)).toStrictEqual({
      ok: false,
      error: {
        source: "mandate",
        error: { kind: "unavailable", cause: "stub" },
      },
    });

    const halfway = approvedOf(await storedTrip(deps, proposed.id));

    expect(halfway.authorizations).toHaveLength(1);

    const paid = await mustPay(deps, proposed.id);

    expect(paid.authorizations).toHaveLength(3);

    const ledger = mustOk(await loadLedgerViews(USER, deps));

    expect(ledger.publicLedger.authorizedCount).toBe(3);
  });

  test("支払い済みをもう一度支払うと wrongStatus になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    await mustApprove(deps, proposed.id);
    await mustPay(deps, proposed.id);

    expect(await payForTrip(USER, proposed.id, NOW, deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: {
          kind: "wrongStatus",
          tripId: proposed.id,
          expected: "approved",
          actual: "paid",
        },
      },
    });
  });
});

describe("writeBackTrip", () => {
  test("支払い済みを書き戻すと、出発から到着までの予定が 1 件増える", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    await mustApprove(deps, proposed.id);
    const paid = await mustPay(deps, proposed.id);

    const written = mustOk(
      await writeBackTrip(
        { userId: USER, tripId: paid.id, renderText, now: NOW },
        deps,
      ),
    );

    expect(written.status).toBe("written");
    expect(written.writtenAt).toBe(NOW);
    expect(await deps.calendar.getEvent(written.writtenEventId)).toStrictEqual({
      ok: true,
      value: {
        id: written.writtenEventId,
        title: "大阪 出張",
        description: `合計 ${OVERNIGHT_TOTAL} MST`,
        when: {
          kind: "timed",
          start: "2026-09-21T08:33:00+09:00",
          end: "2026-09-22T17:27:00+09:00",
        },
        location: "大阪",
      },
    });
  });

  test("承認済みのままでは wrongStatus になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    await mustApprove(deps, proposed.id);

    expect(
      await writeBackTrip(
        { userId: USER, tripId: proposed.id, renderText, now: NOW },
        deps,
      ),
    ).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: {
          kind: "wrongStatus",
          tripId: proposed.id,
          expected: "paid",
          actual: "approved",
        },
      },
    });
  });
});

describe("loadLedgerViews", () => {
  test("支払い後は公開台帳に候補と同じ件数が載り、private な mandate に合計が載る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    await mustApprove(deps, proposed.id);
    await mustPay(deps, proposed.id);

    const ledger = mustOk(await loadLedgerViews(USER, deps));

    expect(ledger.publicLedger.authorizedCount).toBe(3);
    expect(ledger.privateMandate?.spent).toStrictEqual(mst(OVERNIGHT_TOTAL));
  });

  test("mandate が無ければ privateMandate を省く", async () => {
    const deps = testDeps();

    const ledger = mustOk(await loadLedgerViews(USER, deps));

    expect(ledger.publicLedger.authorizedCount).toBe(0);
    expect("privateMandate" in ledger).toBe(false);
  });
});
