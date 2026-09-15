import { describe, expect, test } from "vitest";
import { sequentialTripIds, UNKNOWN_TRIP_ID } from "@/testing/ids";
import {
  createFakeCalendar,
  seedCalendarEvents,
} from "@/adapters/calendar/fake";
import { createFakeCatalog, seedCatalog } from "@/adapters/catalog/fake";
import type { FakeIdentityIds } from "@/adapters/identity/fake";
import { createFakeIdentity } from "@/adapters/identity/fake";
import { jstDateOf } from "@/adapters/jst";
import type { FakeMandateIds } from "@/adapters/mandate/fake";
import { createFakeMandate } from "@/adapters/mandate/fake";
import { createFakePlanner } from "@/adapters/planner/fake";
import { createFakeProfile } from "@/adapters/profile/fake";
import { createFakeStore } from "@/adapters/store/fake";
import type { CalendarPort } from "@/domain/calendar";
import type { LodgingOffer, PlaceOffer } from "@/domain/catalog";
import { addDays, yearsBefore } from "@/domain/dates";
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
import type { IdentityPort } from "@/domain/identity";
import type {
  Mandate,
  MandateDraft,
  MandatePort,
  PaymentRequest,
} from "@/domain/mandate";
import { paymentRefFor } from "@/domain/mandate.parse";
import type { Money } from "@/domain/money";
import type { TravelerPreferences, TripPlan } from "@/domain/plan";
import type { PlannerPort } from "@/domain/planner";
import type { ProfileError, ProfilePort } from "@/domain/profile";
import type { SecretaryStore } from "@/domain/store";
import type {
  ApprovedTrip,
  PaidTrip,
  PaymentVisibilityInput,
  ProposedTrip,
  Trip,
  WrittenTrip,
} from "@/domain/trip";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type { SecretaryDeps } from "./deps";
import { DEFAULT_PREFERENCES } from "./preferences";
import type {
  ApproveTripInput,
  ProposeTripInput,
  RenderEventText,
  ReplanTripInput,
} from "./secretary";
import {
  approveTrip,
  deleteConfirmedTrip,
  loadConfirmedTrips,
  loadDashboard,
  loadLedgerViews,
  loadTrips,
  payForTrip,
  proposeTrip,
  replanTrip,
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

// 30 日の窓は seed の予定 7 件すべてを含む
const RANGE = { from: NOW, to: at("2026-10-09T00:00:00Z") };

// 取引先訪問は日帰り、展示会は 1 泊、チーム定例は出張ではない
const OSAKA_EVENT = eventId("seed-2");

const OVERNIGHT_EVENT = eventId("seed-3");

const MEETING_EVENT = eventId("seed-1");

// 懇親会 (+6 日) と会食 (+9 日) は居酒屋つきの日帰り
const GATHERING_EVENT = eventId("seed-5");

const DINNER_EVENT = eventId("seed-6");

// 工場視察と懇親会 (+16 日から 1 泊) は宿、居酒屋、レジャーがすべて付く
const INSPECTION_EVENT = eventId("seed-7");

// demo と同じ式で、予約者は NOW の 7 日後 (2026-09-16) に 20 歳になる
// 懇親会の出発日 2026-09-15 はまだ 20 歳前、会食の出発日 2026-09-18 は 20 歳以上
const BIRTH_DATE = yearsBefore(addDays(jstDateOf(NOW), 7), 20);

// seedCatalog の価格から計算した合計 (鉄道優先なので ひかり505号 と のぞみ232号 の往復、1 泊は なんばホテルC、居酒屋は 天満 立ち飲み居酒屋 大和、レジャーは本人確認の要らない先頭の 海遊館)
const OSAKA_TOTAL = 14400 + 14520;

const OVERNIGHT_TOTAL = 14400 + 14520 + 12500;

const GATHERING_TOTAL = 14400 + 14520 + 3000;

// 年齢確認が通らず作り直した懇親会の合計 (居酒屋を除くと飲食の先頭は 中之島カフェ)
const REVISED_GATHERING_TOTAL = 14400 + 14520 + 1200;

const INSPECTION_TOTAL = 14400 + 14520 + 12500 + 3000 + 2700;

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

// 採番はテスト設定に閉じているので、identity はユーザ id から、証明の参照は閉じたカウンタで作る
const testIdentityIds = (): FakeIdentityIds => {
  const state = { proved: 0 };

  return {
    identityOf: (id) => `identity:${id}`,
    newProofRef: () => {
      state.proved = state.proved + 1;

      return `proof-${state.proved}`;
    },
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
    identity: createFakeIdentity({ ids: testIdentityIds() }),
    profile: createFakeProfile({ birthDate: BIRTH_DATE }),
    newTripId: sequentialTripIds(),
  };
};

/**
 * planner が受け取った好みを覚える Stub
 *
 * 選択そのものは Fake の planner に任せ、`seen` で最後に渡された好みを見る
 */
type PreferenceRecorder = {
  planner: PlannerPort;
  seen: () => TravelerPreferences | undefined;
};

const recordingPlanner = (): PreferenceRecorder => {
  const inner = createFakePlanner();
  // 記録はこの関数に閉じた局所ミューテーションで、テストからは seen() 越しにしか見えない
  const state: { preferences?: TravelerPreferences } = {};

  return {
    planner: {
      interpretEvent: inner.interpretEvent,
      choosePlan: async (intent, offers, context) => {
        state.preferences = context.preferences;

        return inner.choosePlan(intent, offers, context);
      },
    },
    seen: () => state.preferences,
  };
};

const PROFILE_UNAVAILABLE: ProfileError = {
  kind: "unavailable",
  cause: "test: profile is down",
};

// 好みの読み取りだけが失敗するプロフィール (生年月日は読める)
const brokenPreferences: ProfilePort = {
  readBirthDate: async () => ok(BIRTH_DATE),
  readPreferences: async () => err(PROFILE_UNAVAILABLE),
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

const diningOf = (plan: TripPlan): PlaceOffer => {
  if (plan.dining === undefined) {
    throw new Error("test: expected a dining offer");
  }

  return plan.dining;
};

const leisureOf = (plan: TripPlan): PlaceOffer => {
  if (plan.leisure === undefined) {
    throw new Error("test: expected a leisure offer");
  }

  return plan.leisure;
};

const draftFor = (cap: number): MandateDraft => {
  return { cap: mst(cap), expiresAt: EXPIRES_AT, purpose: "出張手配" };
};

const proposeInput = (event: CalendarEventId): ProposeTripInput => {
  return {
    userId: USER,
    eventId: event,
    locale: "ja",
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

const approveInput = (
  id: TripId,
  requested: PaymentVisibilityInput = {},
): ApproveTripInput => {
  return { userId: USER, tripId: id, requested, now: NOW };
};

const replanInput = (id: TripId): ReplanTripInput => {
  return {
    userId: USER,
    tripId: id,
    locale: "ja",
    now: NOW,
  };
};

const mustApprove = async (
  deps: SecretaryDeps,
  id: TripId,
  requested: PaymentVisibilityInput = {},
): Promise<ApprovedTrip> => {
  const outcome = mustOk(await approveTrip(approveInput(id, requested), deps));

  if (outcome.kind !== "approved") {
    throw new Error(`test: expected an approval but was ${outcome.kind}`);
  }

  return outcome.trip;
};

// 年齢確認が通らなかったことを前提に、記録つきの提案を取り出す
const mustFailAgeCheck = async (
  deps: SecretaryDeps,
  id: TripId,
  requested: PaymentVisibilityInput = {},
): Promise<ProposedTrip> => {
  const outcome = mustOk(await approveTrip(approveInput(id, requested), deps));

  if (outcome.kind !== "ageNotVerified") {
    throw new Error(
      `test: expected a failed age check but was ${outcome.kind}`,
    );
  }

  return outcome.trip;
};

const mustReplan = async (
  deps: SecretaryDeps,
  id: TripId,
): Promise<ProposedTrip> => {
  return mustOk(await replanTrip(replanInput(id), deps));
};

const mustPay = async (deps: SecretaryDeps, id: TripId): Promise<PaidTrip> => {
  return mustOk(await payForTrip(USER, id, NOW, deps));
};

// 提案から書き戻しまでを一気に進める (支払い枠は呼び出し側が先に作る)
const mustWriteBack = async (
  deps: SecretaryDeps,
  event: CalendarEventId,
): Promise<WrittenTrip> => {
  const proposed = await mustPropose(deps, event);

  await mustApprove(deps, proposed.id);
  await mustPay(deps, proposed.id);

  return mustOk(
    await writeBackTrip(
      { userId: USER, tripId: proposed.id, renderText, now: NOW },
      deps,
    ),
  ).trip;
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

// 非公開に対応していない adapter を模し、他は Fake に委譲する
const withoutPrivateSettlement = (mandate: MandatePort): MandatePort => {
  return { ...mandate, capabilities: { privateSettlement: false } };
};

// 支払いの要求を順に溜める入れ物 (テストの中だけで見る)
type SeenPayments = {
  requests: readonly PaymentRequest[];
};

// 受け取った支払いの要求を記録し、支払い自体は Fake に委譲する
const recordsPayments = (
  mandate: MandatePort,
  seen: SeenPayments,
): MandatePort => {
  return {
    ...mandate,
    authorizePayment: async (request) => {
      // テスト設定に閉じた記録用の代入 (関数の外からは seen 経由でしか見ない)
      seen.requests = [...seen.requests, request];

      return mandate.authorizePayment(request);
    },
  };
};

// listEvents だけを失敗させ、他は Fake に委譲する
const failsToListEvents = (calendar: CalendarPort): CalendarPort => {
  return {
    ...calendar,
    listEvents: async () => err({ kind: "network", cause: "stub" }),
  };
};

// listTrips だけを失敗させ、他は Fake に委譲する
const failsToListTrips = (store: SecretaryStore): SecretaryStore => {
  return {
    ...store,
    listTrips: async () => err({ kind: "unavailable", cause: "stub" }),
  };
};

// 確定旅程の保存だけを失敗させ、他は Fake に委譲する
const failsToPutConfirmed = (store: SecretaryStore): SecretaryStore => {
  return {
    ...store,
    putConfirmedTrip: async () => err({ kind: "unavailable", cause: "stub" }),
  };
};

// 2 回目の登録だけ失敗させ、他は Fake に委譲する (登録が 1 回で済むことを値で確かめる)
const failsAtSecondRegistration = (identity: IdentityPort): IdentityPort => {
  const state = { calls: 0 };

  return {
    ...identity,
    registerBirthDate: async (userId, birthDate, now) => {
      state.calls = state.calls + 1;

      if (state.calls === 2) {
        return err({ kind: "unavailable", cause: "stub" });
      }

      return identity.registerBirthDate(userId, birthDate, now);
    },
  };
};

describe("loadDashboard", () => {
  test("mandate が無ければ省き、期間内の予定を返す", async () => {
    const deps = testDeps();

    const dashboard = mustOk(await loadDashboard(USER, RANGE, deps));

    expect(dashboard.events).toHaveLength(7);
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

describe("loadTrips", () => {
  test("trip が無ければ空", async () => {
    const deps = testDeps();

    expect(mustOk(await loadTrips(USER, deps))).toStrictEqual([]);
  });

  test("提案した trip が入る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const trip = await mustPropose(deps, OSAKA_EVENT);

    expect(mustOk(await loadTrips(USER, deps))).toStrictEqual([trip]);
  });

  test("カレンダーは読まないので、カレンダーが失敗しても成功する", async () => {
    const deps = testDeps();

    expect(
      mustOk(
        await loadTrips(USER, {
          ...deps,
          calendar: failsToListEvents(deps.calendar),
        }),
      ),
    ).toStrictEqual([]);
  });

  test("store の読み取りが失敗したらその失敗を返す", async () => {
    const deps = testDeps();

    expect(
      await loadTrips(USER, { ...deps, store: failsToListTrips(deps.store) }),
    ).toStrictEqual({
      ok: false,
      error: { source: "store", error: { kind: "unavailable", cause: "stub" } },
    });
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

  test("懇親会の予定は居酒屋が付き、合計に 3,000 が入る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const trip = await mustPropose(deps, GATHERING_EVENT);

    expect(diningOf(trip.plan).id).toBe("restaurant-izakaya-tenma");
    expect(diningOf(trip.plan).price).toStrictEqual(mst(3000));
    expect(trip.plan.lodging).toBeUndefined();
    expect(trip.plan.total).toStrictEqual(mst(GATHERING_TOTAL));
  });

  test("工場視察と懇親会の予定は宿、居酒屋、レジャーがすべて付き、合計に全部が入る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const trip = await mustPropose(deps, INSPECTION_EVENT);

    expect(lodgingOf(trip.plan).id).toBe("hotel-namba-c");
    expect(diningOf(trip.plan).id).toBe("restaurant-izakaya-tenma");
    expect(leisureOf(trip.plan).id).toBe("leisure-kaiyukan");
    expect(leisureOf(trip.plan).price).toStrictEqual(mst(2700));
    expect(trip.plan.total).toStrictEqual(mst(INSPECTION_TOTAL));
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
  test("指定なしで承認すると、すべて公開で authorizations が空で始まる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    const approved = await mustApprove(deps, proposed.id);

    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).toBe(NOW);
    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
    });
    expect(approved.authorizations).toStrictEqual([]);
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(approved);
  });

  test("宿だけを非公開にすると、その候補だけ private になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    const approved = await mustApprove(deps, proposed.id, {
      lodging: "private",
    });

    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "private",
    });
  });

  test("飲食だけを非公開にすると、その候補だけ private になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, DINNER_EVENT);

    const approved = await mustApprove(deps, proposed.id, {
      dining: "private",
    });

    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
      dining: "private",
    });
  });

  test("飲食の無い計画への飲食の指定は捨てる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    const approved = await mustApprove(deps, proposed.id, {
      dining: "private",
    });

    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
    });
  });

  test("飲食とレジャーを非公開にすると、5 候補のうちその 2 つだけ private になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, INSPECTION_EVENT);

    const approved = await mustApprove(deps, proposed.id, {
      dining: "private",
      leisure: "private",
    });

    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
      dining: "private",
      leisure: "private",
    });
  });

  test("レジャーの無い計画へのレジャーの指定は捨てる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, DINNER_EVENT);

    const approved = await mustApprove(deps, proposed.id, {
      leisure: "private",
    });

    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
      dining: "public",
    });
  });

  test("非公開に対応していない adapter に非公開を頼むと privateSettlementUnsupported になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    const limited = {
      ...deps,
      mandate: withoutPrivateSettlement(deps.mandate),
    };

    expect(
      await approveTrip(
        approveInput(proposed.id, { lodging: "private" }),
        limited,
      ),
    ).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: {
          kind: "privateSettlementUnsupported",
          tripId: proposed.id,
        },
      },
    });
    expect((await storedTrip(deps, proposed.id)).status).toBe("proposed");
  });

  test("非公開に対応していない adapter でも、すべて公開なら承認できる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    const limited = {
      ...deps,
      mandate: withoutPrivateSettlement(deps.mandate),
    };

    const approved = await mustApprove(limited, proposed.id);

    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
    });
  });

  test("成人を要しない計画は証明なしで承認し、identity には登録しない", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    const approved = await mustApprove(deps, proposed.id);

    expect("ageProof" in approved).toBe(false);
    expect(await deps.identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("生年月日が無ければ birthDateMissing で、trip は提案済みのまま", async () => {
    const deps = { ...testDeps(), profile: createFakeProfile({}) };

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    expect(await approveTrip(approveInput(proposed.id), deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: { kind: "birthDateMissing", tripId: proposed.id },
      },
    });
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(proposed);
    expect(await deps.identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("出発日にまだ 20 歳でなければ計画を変えず、証明が通らなかった記録を付けて提案済みのまま残す", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    const rejected = await mustFailAgeCheck(deps, proposed.id, {
      dining: "private",
    });

    expect(rejected).toStrictEqual({
      ...proposed,
      failedAgeCheck: {
        ageLimit: 20,
        cutoffDate: "2006-09-15",
        visibility: {
          outbound: "public",
          inbound: "public",
          dining: "private",
        },
        checkedAt: NOW,
      },
    });
    expect(diningOf(rejected.plan).id).toBe("restaurant-izakaya-tenma");
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(rejected);
  });

  test("組み直した提案は証明なしで承認でき、作り直しの記録を引き継ぐ", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    await mustFailAgeCheck(deps, proposed.id);
    const revised = await mustReplan(deps, proposed.id);

    const approved = await mustApprove(deps, proposed.id);

    expect("ageProof" in approved).toBe(false);
    expect("failedAgeCheck" in approved).toBe(false);
    expect(approved.plan).toStrictEqual(revised.plan);
    expect(approved.revision).toStrictEqual(revised.revision);
  });

  test("出発日に 20 歳以上なら ageProof 付きで承認し、identity に登録が 1 件できる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, DINNER_EVENT);

    const approved = await mustApprove(deps, proposed.id);

    expect(approved.ageProof).toStrictEqual({
      identity: "identity:user-1",
      cutoffDate: "2006-09-18",
      proofRef: "proof-1",
      provedAt: NOW,
    });
    expect(approved.authorizations).toStrictEqual([]);
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(approved);
    expect(await deps.identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: { userId: USER, identity: "identity:user-1", registeredAt: NOW },
    });
  });

  test("2 つ目の出張の承認は登録を増やさず、最初の登録の identity のまま", async () => {
    const base = testDeps();
    const deps = {
      ...base,
      identity: failsAtSecondRegistration(base.identity),
    };

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const dinner = await mustPropose(deps, DINNER_EVENT);
    const gathering = await mustPropose(deps, GATHERING_EVENT);

    const approved = await mustApprove(deps, dinner.id);
    const rejected = await mustFailAgeCheck(deps, gathering.id);

    // 2 回目の登録なら unavailable になるので、証明の結果まで進むのは登録を飛ばした証
    expect(rejected.failedAgeCheck?.ageLimit).toBe(20);
    expect(await deps.identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: {
        userId: USER,
        identity: approved.ageProof?.identity,
        registeredAt: NOW,
      },
    });
  });

  test("知らない trip id は tripNotFound になる", async () => {
    const deps = testDeps();
    const unknown = UNKNOWN_TRIP_ID;

    expect(await approveTrip(approveInput(unknown), deps)).toStrictEqual({
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

    expect(await approveTrip(approveInput(proposed.id), deps)).toStrictEqual({
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

describe("replanTrip", () => {
  test("証明が通らなかった提案を年齢制限のない候補で組み直し、同じ id の提案として残す", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);
    const rejected = await mustFailAgeCheck(deps, proposed.id, {
      dining: "private",
    });

    const revised = await mustReplan(deps, proposed.id);

    expect(revised.id).toBe(proposed.id);
    expect(revised.proposedAt).toBe(NOW);
    expect("failedAgeCheck" in revised).toBe(false);
    expect(revised.revision).toStrictEqual({
      reason: {
        kind: "ageNotVerified",
        ageLimit: 20,
        cutoffDate: "2006-09-15",
      },
      previous: {
        plan: proposed.plan,
        proposedAt: proposed.proposedAt,
        visibility: rejected.failedAgeCheck?.visibility,
      },
      revisedAt: NOW,
    });
    expect(revised.revision?.previous.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
      dining: "private",
    });
    expect(diningOf(revised.plan).id).toBe("restaurant-cafe-nakanoshima");
    expect(diningOf(revised.plan).requiredVerifications).toStrictEqual([]);
    expect(revised.plan.total).toStrictEqual(mst(REVISED_GATHERING_TOTAL));
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(revised);
  });

  test("証明が通らなかった記録の無い提案は replanNotNeeded になり、計画は変わらない", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    expect(await replanTrip(replanInput(proposed.id), deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: { kind: "replanNotNeeded", tripId: proposed.id },
      },
    });
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(proposed);
  });

  test("組み直した提案をもう一度組み直すと replanNotNeeded になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    await mustFailAgeCheck(deps, proposed.id);
    const revised = await mustReplan(deps, proposed.id);

    expect(await replanTrip(replanInput(proposed.id), deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: { kind: "replanNotNeeded", tripId: proposed.id },
      },
    });
    expect(await storedTrip(deps, proposed.id)).toStrictEqual(revised);
  });

  test("承認済みの trip は wrongStatus になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    await mustApprove(deps, proposed.id);

    expect(await replanTrip(replanInput(proposed.id), deps)).toStrictEqual({
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

  test("知らない trip id は tripNotFound になる", async () => {
    const deps = testDeps();
    const unknown = UNKNOWN_TRIP_ID;

    expect(await replanTrip(replanInput(unknown), deps)).toStrictEqual({
      ok: false,
      error: {
        source: "flow",
        error: { kind: "tripNotFound", tripId: unknown },
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

  test("承認で選んだ候補ごとの公開範囲を、支払いの要求にそのまま写す", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OVERNIGHT_EVENT);

    await mustApprove(deps, proposed.id, {
      inbound: "private",
      lodging: "private",
    });

    const seen: SeenPayments = { requests: [] };
    const watched = { ...deps, mandate: recordsPayments(deps.mandate, seen) };

    const paid = await mustPay(watched, proposed.id);

    expect(seen.requests.map((request) => request.visibility)).toStrictEqual([
      "public",
      "private",
      "private",
    ]);
    expect(
      paid.authorizations.map((authorization) => authorization.settlement.kind),
    ).toStrictEqual(["tokenTransfer", "shieldedTransfer", "shieldedTransfer"]);
  });

  test("飲食を非公開にすると、3 件目の支払いだけが shielded になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, DINNER_EVENT);

    await mustApprove(deps, proposed.id, { dining: "private" });

    const seen: SeenPayments = { requests: [] };
    const watched = { ...deps, mandate: recordsPayments(deps.mandate, seen) };

    const paid = await mustPay(watched, proposed.id);

    expect(seen.requests.map((request) => request.visibility)).toStrictEqual([
      "public",
      "public",
      "private",
    ]);
    expect(
      paid.authorizations.map((authorization) => authorization.settlement.kind),
    ).toStrictEqual(["tokenTransfer", "tokenTransfer", "shieldedTransfer"]);
  });

  test("居酒屋つきの日帰りは往路、復路、飲食の順に 3 件支払い、証明は引き継ぐ", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, DINNER_EVENT);

    const approved = await mustApprove(deps, proposed.id);
    const paid = await mustPay(deps, proposed.id);

    expect(
      paid.authorizations.map((authorization) => authorization.paymentRef),
    ).toStrictEqual([
      paymentRefFor(paid.id, paid.plan.outbound.id),
      paymentRefFor(paid.id, paid.plan.inbound.id),
      paymentRefFor(paid.id, diningOf(paid.plan).id),
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
    expect(paid.authorizations.at(2)?.amount).toStrictEqual(mst(3000));
    expect(paid.ageProof).toStrictEqual(approved.ageProof);

    const ledger = mustOk(await loadLedgerViews(USER, deps));

    expect(ledger.privateMandate?.spent).toStrictEqual(mst(GATHERING_TOTAL));
  });

  test("全部つきの 1 泊は往路、復路、宿泊、飲食、レジャーの順に 5 件支払い、非公開の 4 件目と 5 件目だけが shielded になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, INSPECTION_EVENT);

    await mustApprove(deps, proposed.id, {
      dining: "private",
      leisure: "private",
    });

    const seen: SeenPayments = { requests: [] };
    const watched = { ...deps, mandate: recordsPayments(deps.mandate, seen) };

    const paid = await mustPay(watched, proposed.id);

    expect(
      paid.authorizations.map((authorization) => authorization.paymentRef),
    ).toStrictEqual([
      paymentRefFor(paid.id, paid.plan.outbound.id),
      paymentRefFor(paid.id, paid.plan.inbound.id),
      paymentRefFor(paid.id, lodgingOf(paid.plan).id),
      paymentRefFor(paid.id, diningOf(paid.plan).id),
      paymentRefFor(paid.id, leisureOf(paid.plan).id),
    ]);
    expect(seen.requests.map((request) => request.visibility)).toStrictEqual([
      "public",
      "public",
      "public",
      "private",
      "private",
    ]);
    expect(
      paid.authorizations.map((authorization) => authorization.settlement.kind),
    ).toStrictEqual([
      "tokenTransfer",
      "tokenTransfer",
      "tokenTransfer",
      "shieldedTransfer",
      "shieldedTransfer",
    ]);
    expect(paid.authorizations.at(4)?.amount).toStrictEqual(mst(2700));

    const ledger = mustOk(await loadLedgerViews(USER, deps));

    expect(ledger.privateMandate?.spent).toStrictEqual(mst(INSPECTION_TOTAL));
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

    const result = mustOk(
      await writeBackTrip(
        { userId: USER, tripId: paid.id, renderText, now: NOW },
        deps,
      ),
    );
    const written = result.trip;

    expect(written.status).toBe("written");
    expect(written.writtenAt).toBe(NOW);
    expect("confirmedStoreError" in result).toBe(false);
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

  test("書き戻すと確定旅程に明細つきで載る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const written = await mustWriteBack(deps, INSPECTION_EVENT);
    const confirmed = mustOk(await loadConfirmedTrips(USER, deps));

    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]?.id).toBe(written.id);
    expect(confirmed[0]?.originCity).toBe("東京");
    expect(confirmed[0]?.destinationCity).toBe("大阪");
    expect(confirmed[0]?.total).toStrictEqual(mst(INSPECTION_TOTAL));
    expect(confirmed[0]?.confirmedAt).toBe(NOW);
    // 明細は支払いの順 (往路、復路、宿、飲食、レジャー)
    expect(confirmed[0]?.items.map((item) => item.category)).toStrictEqual([
      "rail",
      "rail",
      "hotel",
      "restaurant",
      "leisure",
    ]);
    expect(confirmed[0]?.items.map((item) => item.seq)).toStrictEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  test("同じ出張を 2 回書き戻しても確定旅程は 1 件のまま", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const written = await mustWriteBack(deps, OSAKA_EVENT);

    // written のままなので 2 回目は wrongStatus になり、確定旅程は増えない
    await writeBackTrip(
      { userId: USER, tripId: written.id, renderText, now: NOW },
      deps,
    );

    expect(mustOk(await loadConfirmedTrips(USER, deps))).toHaveLength(1);
  });

  test("確定旅程の保存が失敗しても書き戻しは成功し、失敗が結果に付く", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    await mustApprove(deps, proposed.id);
    await mustPay(deps, proposed.id);

    const result = mustOk(
      await writeBackTrip(
        { userId: USER, tripId: proposed.id, renderText, now: NOW },
        { ...deps, store: failsToPutConfirmed(deps.store) },
      ),
    );

    expect(result.trip.status).toBe("written");
    expect(result.confirmedStoreError).toStrictEqual({
      kind: "unavailable",
      cause: "stub",
    });
    // 書き戻しは済んでいるので trip は written で残る
    expect((await storedTrip(deps, proposed.id)).status).toBe("written");
  });
});

describe("loadConfirmedTrips", () => {
  test("書き戻していなければ空で、進行中の出張は載らない", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, OSAKA_EVENT);

    expect(mustOk(await loadConfirmedTrips(USER, deps))).toStrictEqual([]);
    expect(mustOk(await loadTrips(USER, deps))).toStrictEqual([proposed]);
  });

  test("進行中と確定が分かれて返る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const written = await mustWriteBack(deps, OSAKA_EVENT);

    await mustPropose(deps, OVERNIGHT_EVENT);

    const active = mustOk(await loadTrips(USER, deps));
    const confirmed = mustOk(await loadConfirmedTrips(USER, deps));

    expect(active.map((trip) => trip.status).toSorted()).toStrictEqual([
      "proposed",
      "written",
    ]);
    expect(confirmed.map((trip) => trip.id)).toStrictEqual([written.id]);
  });

  test("store の読み取りが失敗したらその失敗を返す", async () => {
    const deps = testDeps();

    expect(
      await loadConfirmedTrips(USER, {
        ...deps,
        store: {
          ...deps.store,
          listConfirmedTrips: async () =>
            err({ kind: "unavailable", cause: "stub" }),
        },
      }),
    ).toStrictEqual({
      ok: false,
      error: { source: "store", error: { kind: "unavailable", cause: "stub" } },
    });
  });
});

describe("deleteConfirmedTrip", () => {
  test("消すと確定旅程から消え、手配中の出張は残る", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const written = await mustWriteBack(deps, OSAKA_EVENT);

    expect(await deleteConfirmedTrip(USER, written.id, deps)).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(mustOk(await loadConfirmedTrips(USER, deps))).toStrictEqual([]);
    expect(
      mustOk(await loadTrips(USER, deps)).map((trip) => trip.id),
    ).toStrictEqual([written.id]);
  });

  test("store の削除が失敗したらその失敗を返す", async () => {
    const deps = testDeps();

    expect(
      await deleteConfirmedTrip(USER, UNKNOWN_TRIP_ID, {
        ...deps,
        store: {
          ...deps.store,
          deleteConfirmedTrip: async () =>
            err({ kind: "unavailable", cause: "stub" }),
        },
      }),
    ).toStrictEqual({
      ok: false,
      error: { source: "store", error: { kind: "unavailable", cause: "stub" } },
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

describe("planner に渡す好み", () => {
  const PROFILE_PREFERENCES: TravelerPreferences = {
    homeStation: "東京",
    preferredTransport: "rail",
    diningGenres: ["粉もん"],
    leisureGenres: ["history"],
  };

  test("プロフィールの好みがそのまま planner に渡る", async () => {
    const recorder = recordingPlanner();
    const deps = {
      ...testDeps(),
      planner: recorder.planner,
      profile: createFakeProfile({
        birthDate: BIRTH_DATE,
        preferences: PROFILE_PREFERENCES,
      }),
    };

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    expect(recorder.seen()).toStrictEqual(PROFILE_PREFERENCES);
    expect(diningOf(proposed.plan).genre).toBe("粉もん");
  });

  test("プロフィールに好みが無ければ既定値が planner に渡る", async () => {
    const recorder = recordingPlanner();
    const deps = { ...testDeps(), planner: recorder.planner };

    await mustSetUpMandate(deps, ENOUGH_CAP);
    await mustPropose(deps, GATHERING_EVENT);

    expect(recorder.seen()).toStrictEqual(DEFAULT_PREFERENCES);
  });

  test("好みの読み取りに失敗したら提案は profile の失敗になる", async () => {
    const deps = { ...testDeps(), profile: brokenPreferences };

    await mustSetUpMandate(deps, ENOUGH_CAP);

    expect(
      await proposeTrip(proposeInput(GATHERING_EVENT), deps),
    ).toStrictEqual({
      ok: false,
      error: { source: "profile", error: PROFILE_UNAVAILABLE },
    });
  });

  // 組み直しは年齢確認が通らなかった提案が要るので、好みは年齢制限のある居酒屋に寄せる
  test("組み直しでもプロフィールの好みが planner に渡る", async () => {
    const recorder = recordingPlanner();
    const preferences: TravelerPreferences = {
      homeStation: "東京",
      preferredTransport: "rail",
      diningGenres: ["居酒屋"],
      leisureGenres: ["history"],
    };
    const deps = {
      ...testDeps(),
      planner: recorder.planner,
      profile: createFakeProfile({ birthDate: BIRTH_DATE, preferences }),
    };

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    await mustFailAgeCheck(deps, proposed.id);
    await mustReplan(deps, proposed.id);

    expect(recorder.seen()).toStrictEqual(preferences);
  });

  test("好みの読み取りに失敗したら組み直しも profile の失敗になる", async () => {
    const deps = testDeps();

    await mustSetUpMandate(deps, ENOUGH_CAP);
    const proposed = await mustPropose(deps, GATHERING_EVENT);

    await mustFailAgeCheck(deps, proposed.id);

    expect(
      await replanTrip(replanInput(proposed.id), {
        ...deps,
        profile: brokenPreferences,
      }),
    ).toStrictEqual({
      ok: false,
      error: { source: "profile", error: PROFILE_UNAVAILABLE },
    });
  });
});
