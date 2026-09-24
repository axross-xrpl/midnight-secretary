import { describe, expect, test } from "vitest";
import { sequentialTripIds, testCatalogIds, tripIdOf } from "@/testing/ids";
import type { SecretaryContext } from "@/adapters/auth/session";
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
import { createFakeStore } from "@/adapters/store/fake";
import type { SecretaryDeps } from "@/application/deps";
import type { RenderEventText } from "@/application/secretary";
import {
  approveTrip,
  payForTrip,
  proposeTrip,
  setUpMandate,
  writeBackTrip,
} from "@/application/secretary";
import type { TasksQuery } from "@/components/tasks/query";
import {
  activeTripsOf,
  candidateEventsOf,
  confirmedTripsOf,
} from "@/components/tasks/rows";
import type { CalendarEvent, CalendarPort } from "@/domain/calendar";
import { addDays, yearsBefore } from "@/domain/dates";
import type {
  CalendarEventId,
  IsoDate,
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
import type { ProfilePort } from "@/domain/profile";
import type { SecretaryStore } from "@/domain/store";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type { ScanState } from "./tasks-page";
import { loadTasksData } from "./tasks-page";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const eventId = (raw: string): CalendarEventId => {
  return mustParse(parseCalendarEventId(raw));
};

const NOW = at("2026-09-09T00:00:00Z");

const USER: UserId = mustParse(parseUserId("user-1"));

const CAP = 200000;

// demo と同じ式 (NOW の 7 日後の 20 年前)
const BIRTH_DATE = yearsBefore(addDays(jstDateOf(NOW), 7), 20);

// 取引先訪問は日帰りの出張
const OSAKA_EVENT = eventId("seed-2");

// Fake のカレンダーが返す日時順 (懇親会が歯医者より先、会食が展示会より先、工場視察が最後)
const SEED_IDS = [
  "seed-1",
  "seed-2",
  "seed-5",
  "seed-4",
  "seed-6",
  "seed-3",
  "seed-7",
];

const DETECT: TasksQuery = { tab: "detect", scan: false };

const SCANNED: TasksQuery = { tab: "detect", scan: true };

const TRIPS: TasksQuery = { tab: "trips", scan: false };

const NOT_SCANNED: ScanState = { kind: "notScanned" };

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

/**
 * 生年月日だけを返すプロフィールの Stub (好みは未登録)
 *
 * 生年月日を省くと未登録として undefined を返す
 * fake のプロフィールは画面の行を丸ごと持つので、生年月日だけがあって好みが無い状態を表せない
 */
type ProfileStubValues = {
  birthDate?: IsoDate;
};

const stubProfile = (values: ProfileStubValues): ProfilePort => {
  return {
    readBirthDate: async () => ok(values.birthDate),
    readPreferences: async () => ok(undefined),
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
const testContext = (): SecretaryContext => {
  const deps: SecretaryDeps = {
    calendar: createFakeCalendar({
      events: seedCalendarEvents(NOW),
      newEventId: testEventIds(),
    }),
    catalog: createFakeCatalog(seedCatalog(), testCatalogIds(NOW)),
    planner: createFakePlanner(),
    mandate: createFakeMandate({ mandates: [], ids: testMandateIds() }),
    store: createFakeStore(),
    identity: createFakeIdentity({ ids: testIdentityIds() }),
    profile: stubProfile({ birthDate: BIRTH_DATE }),
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

// listTrips だけを空にする (サーバの再起動でメモリの trip が消えた状態)
// 確定旅程は DB に残るので Fake に委譲する
const forgottenTrips = (store: SecretaryStore): SecretaryStore => {
  return {
    ...store,
    listTrips: async () => ok([]),
  };
};

const withForgottenTrips = (context: SecretaryContext): SecretaryContext => {
  return {
    ...context,
    deps: { ...context.deps, store: forgottenTrips(context.deps.store) },
  };
};

// listEvents だけを失敗させ、他は Fake に委譲する
const failingEvents = (calendar: CalendarPort): CalendarPort => {
  return {
    ...calendar,
    listEvents: async () => err({ kind: "network", cause: "stub" }),
  };
};

const withFailingCalendar = (context: SecretaryContext): SecretaryContext => {
  return {
    ...context,
    deps: { ...context.deps, calendar: failingEvents(context.deps.calendar) },
  };
};

const DRAFT: MandateDraft = {
  cap: { amount: mustParse(parseAmount(CAP)), currency: "MST" },
  expiresAt: at("2026-12-31T23:59:59+09:00"),
  purpose: "出張の手配",
};

// 書き戻す予定の文言 (Route Handler が next-intl で作るものの Stub)
const renderText: RenderEventText = () => {
  return { title: "大阪 出張", description: "秘書が手配しました" };
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

// スキャン済みを前提に窓の予定を取り出す (スキャン前ならテストの失敗なので throw)
const scannedEventsOf = (scan: ScanState): readonly CalendarEvent[] => {
  if (scan.kind !== "scanned") {
    throw new Error("test: expected a scanned state");
  }

  return scan.events;
};

const idsOf = (events: readonly CalendarEvent[]): string[] => {
  return events.map((event) => event.id);
};

// 支払い枠を作ってから予定 1 件を提案する (提案には支払い枠が要る)
const arrange = async (
  context: SecretaryContext,
  event: CalendarEventId,
): Promise<void> => {
  mustOk(await setUpMandate(context.userId, DRAFT, context.now, context.deps));
  mustOk(
    await proposeTrip(
      {
        userId: context.userId,
        eventId: event,
        locale: "ja",
        now: context.now,
      },
      context.deps,
    ),
  );
};

// 提案済みの trip を承認 -> 支払い -> カレンダー登録 まで進める
const finish = async (context: SecretaryContext): Promise<void> => {
  const tripId = tripIdOf(1);

  mustOk(
    await approveTrip(
      { userId: context.userId, tripId, requested: {}, now: context.now },
      context.deps,
    ),
  );
  mustOk(await payForTrip(context.userId, tripId, context.now, context.deps));
  mustOk(
    await writeBackTrip(
      { userId: context.userId, tripId, renderText, now: context.now },
      context.deps,
    ),
  );
};

describe("loadTasksData", () => {
  test("スキャン前はカレンダーを読まず、trips は空", async () => {
    const context = withFailingCalendar(testContext());

    const data = mustOk(await loadTasksData(context, DETECT));

    expect(data.now).toBe(NOW);
    expect(data.trips).toStrictEqual([]);
    expect(data.confirmed).toStrictEqual([]);
    expect(data.scan).toStrictEqual(NOT_SCANNED);
  });

  test("確定旅程タブもカレンダーを読まない", async () => {
    const context = withFailingCalendar(testContext());

    const data = mustOk(await loadTasksData(context, TRIPS));

    expect(data.scan).toStrictEqual(NOT_SCANNED);
  });

  test("スキャン済みなら窓の予定 7 件を日時順に持つ", async () => {
    const context = testContext();

    const data = mustOk(await loadTasksData(context, SCANNED));

    expect(data.now).toBe(NOW);
    expect(data.trips).toStrictEqual([]);
    expect(idsOf(scannedEventsOf(data.scan))).toStrictEqual(SEED_IDS);
  });

  test("スキャン済みでカレンダーが失敗したらその失敗を返す", async () => {
    const context = withFailingCalendar(testContext());

    expect(await loadTasksData(context, SCANNED)).toStrictEqual({
      ok: false,
      error: { source: "calendar", error: { kind: "network", cause: "stub" } },
    });
  });

  test("提案した trip をスキャンの前後どちらでも返す (支払い枠は持たない)", async () => {
    const context = testContext();
    await arrange(context, OSAKA_EVENT);

    const before = mustOk(await loadTasksData(context, DETECT));

    expect("mandate" in before).toBe(false);
    expect(before.trips.map((trip) => trip.status)).toStrictEqual(["proposed"]);
    expect(before.trips[0]?.event.id).toBe("seed-2");
    expect(before.scan).toStrictEqual(NOT_SCANNED);

    const after = mustOk(await loadTasksData(context, SCANNED));

    expect(after.trips).toStrictEqual(before.trips);
    expect(idsOf(scannedEventsOf(after.scan))).toStrictEqual(SEED_IDS);
  });

  test("store の読み取りが失敗したらスキャンの前後どちらでもその失敗を返す", async () => {
    const context = withFailingStore(testContext());
    const failure = {
      ok: false,
      error: { source: "store", error: { kind: "unavailable", cause: "stub" } },
    };

    expect(await loadTasksData(context, DETECT)).toStrictEqual(failure);
    expect(await loadTasksData(context, SCANNED)).toStrictEqual(failure);
  });

  test("カレンダー登録まで進めると、書き戻した予定は窓に入るが手配できる予定には出ず、確定旅程に載る", async () => {
    const context = testContext();
    await arrange(context, OSAKA_EVENT);
    await finish(context);

    const data = mustOk(await loadTasksData(context, SCANNED));
    const events = scannedEventsOf(data.scan);

    // 書き戻した予定は往路の出発 (08:33) から始まるので、10:00 開始の元の予定より前に並ぶ
    expect(idsOf(events)).toStrictEqual([
      "seed-1",
      "written-1",
      "seed-2",
      "seed-5",
      "seed-4",
      "seed-6",
      "seed-3",
      "seed-7",
    ]);
    expect(data.trips.map((trip) => trip.status)).toStrictEqual(["written"]);
    expect(
      candidateEventsOf(events, data.trips, data.confirmed).map(
        (event) => event.id,
      ),
    ).toStrictEqual([
      "seed-1",
      "seed-5",
      "seed-4",
      "seed-6",
      "seed-3",
      "seed-7",
    ]);
    expect(activeTripsOf(data.trips)).toStrictEqual([]);
    expect(
      confirmedTripsOf(data.confirmed).map((trip) => trip.title),
    ).toStrictEqual(["大阪出張 (取引先訪問)"]);
  });

  test("メモリの trip が消えても、確定旅程の予定は手配できる予定に戻らない", async () => {
    const context = testContext();
    await arrange(context, OSAKA_EVENT);
    await finish(context);

    const data = mustOk(
      await loadTasksData(withForgottenTrips(context), SCANNED),
    );
    const events = scannedEventsOf(data.scan);

    expect(data.trips).toStrictEqual([]);
    expect(data.confirmed.map((trip) => trip.sourceEventId)).toStrictEqual([
      "seed-2",
    ]);
    expect(
      candidateEventsOf(events, data.trips, data.confirmed).map(
        (event) => event.id,
      ),
    ).toStrictEqual([
      "seed-1",
      "seed-5",
      "seed-4",
      "seed-6",
      "seed-3",
      "seed-7",
    ]);
  });
});
