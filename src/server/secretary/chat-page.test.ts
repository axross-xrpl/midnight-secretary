import { describe, expect, test } from "vitest";
import { sequentialTripIds, tripIdOf } from "@/testing/ids";
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
import { WAVE1_PREFERENCES } from "@/application/preferences";
import { proposeTrip, setUpMandate } from "@/application/secretary";
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
import { chatRange, loadChatData } from "./chat-page";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const eventId = (raw: string): CalendarEventId => {
  return mustParse(parseCalendarEventId(raw));
};

const NOW = at("2026-09-09T00:00:00Z");

const USER: UserId = mustParse(parseUserId("user-1"));

const CAP = 200000;

// 取引先訪問は日帰りの出張、展示会は 1 泊、seed-9 は Fake のカレンダーに無い
const OSAKA_EVENT = eventId("seed-2");

const OVERNIGHT_EVENT = eventId("seed-3");

const UNKNOWN_EVENT = eventId("seed-9");

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
  cap: { amount: mustParse(parseAmount(CAP)), currency: "MST" },
  expiresAt: at("2026-12-31T23:59:59+09:00"),
  purpose: "出張の手配",
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
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
        preferences: WAVE1_PREFERENCES,
        now: context.now,
      },
      context.deps,
    ),
  );
};

describe("chatRange", () => {
  test("now から 30 日先までの半開区間になる", () => {
    expect(chatRange(NOW)).toStrictEqual({
      from: "2026-09-09T00:00:00Z",
      to: "2026-10-09T00:00:00.000Z",
    });
  });
});

describe("loadChatData", () => {
  test("窓にある予定は、mandate と trip の無いまま予定と空の台帳を返す", async () => {
    const context = testContext();

    const data = mustOk(await loadChatData(context, OSAKA_EVENT));

    expect(data.now).toBe(NOW);
    expect(data.event.id).toBe("seed-2");
    expect(data.event.title).toBe("大阪出張 (取引先訪問)");
    expect(data.mandate).toBeUndefined();
    expect(data.trip).toBeUndefined();
    expect(data.publicLedger).toStrictEqual({
      commitments: [],
      authorizations: [],
      authorizedCount: 0,
    });
  });

  test("mandate の adapter が扱える支払いの形をそのまま渡す", async () => {
    const context = testContext();

    const data = mustOk(await loadChatData(context, OSAKA_EVENT));

    expect(data.capabilities).toStrictEqual(context.deps.mandate.capabilities);
    expect(data.capabilities.privateSettlement).toBe(true);
  });

  test("窓に無い予定は eventNotFound になる", async () => {
    const context = testContext();

    expect(await loadChatData(context, UNKNOWN_EVENT)).toStrictEqual({
      ok: false,
      error: { kind: "eventNotFound", eventId: "seed-9" },
    });
  });

  test("提案した予定にはその trip が付き、他の予定には付かない", async () => {
    const context = testContext();
    await arrange(context, OSAKA_EVENT);

    const osaka = mustOk(await loadChatData(context, OSAKA_EVENT));

    expect(osaka.trip?.status).toBe("proposed");
    expect(osaka.trip?.id).toBe(tripIdOf(1));
    expect(osaka.trip?.event.id).toBe("seed-2");
    expect(osaka.mandate?.cap).toStrictEqual({ amount: CAP, currency: "MST" });
    expect(osaka.publicLedger.commitments).toStrictEqual([
      { mandateId: "mandate-1", commitment: "commitment-1" },
    ]);

    const overnight = mustOk(await loadChatData(context, OVERNIGHT_EVENT));

    expect(overnight.event.id).toBe("seed-3");
    expect(overnight.trip).toBeUndefined();
    expect(overnight.mandate?.id).toBe("mandate-1");
  });

  test("store の読み取りが失敗したらその失敗を返す", async () => {
    const context = withFailingStore(testContext());

    expect(await loadChatData(context, OSAKA_EVENT)).toStrictEqual({
      ok: false,
      error: { source: "store", error: { kind: "unavailable", cause: "stub" } },
    });
  });
});
