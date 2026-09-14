import type { NewTripId } from "@/application/deps";
import type { EnvLike } from "@/application/sources";
import type { RequestContext, SecretaryFactories } from "@/application/wiring";
import type { CalendarPort } from "@/domain/calendar";
import type { CalendarEventId, IsoDateTime } from "@/domain/identifiers";
import { payToken } from "@/lib/dev-contracts/token";
import { err } from "@/lib/result";
import { createFakeCalendar, seedCalendarEvents } from "./calendar/fake";
import { createGoogleCalendar } from "./calendar/google";
import { createFakeCatalog, seedCatalog } from "./catalog/fake";
import { createNeonCatalog } from "./catalog/neon";
import type { FakeMandateIds } from "./mandate/fake";
import { createFakeMandate } from "./mandate/fake";
import { createRealMandate } from "./mandate/real";
import { createFakePlanner } from "./planner/fake";
import { createFakeStore } from "./store/fake";

/**
 * adapter に渡すプロセス全体の入力で、環境変数と開始時刻と id の生成関数
 *
 * id は非決定的なので注入する
 * 各レーンは自分の adapter が入るときに自分のフィールドを追加する
 */
export type ProcessResources = {
  env: EnvLike;
  startedAt: IsoDateTime;
  newTripId: NewTripId;
  newEventId: () => CalendarEventId;
  mandateIds: FakeMandateIds;
};

// Google のトークンが無いリクエストはユーザのカレンダーに届かないので、空のふりをするよりそう伝える方がよい
const UNAUTHENTICATED_CALENDAR: CalendarPort = {
  listEvents: async () => err({ kind: "unauthenticated" }),
  getEvent: async () => err({ kind: "unauthenticated" }),
  insertEvent: async () => err({ kind: "unauthenticated" }),
};

const googleCalendarFor = (context: RequestContext): CalendarPort => {
  if (context.googleAccessToken === undefined) {
    return UNAUTHENTICATED_CALENDAR;
  }

  return createGoogleCalendar(context.googleAccessToken, { fetch });
};

/**
 * composition root で、プロセスごとに 1 回呼ぶ
 *
 * Fake はここで 1 回だけ作り、メモリ上の状態を全リクエストで共有する
 * real の factory は最初は fake と同じで、各レーンが自分の持つ adapter で自分の `real` を差し替える
 */
export const createSecretaryFactories = (
  resources: ProcessResources,
): SecretaryFactories => {
  const fakeCalendar = createFakeCalendar({
    events: seedCalendarEvents(resources.startedAt),
    newEventId: resources.newEventId,
  });
  const fakeCatalog = createFakeCatalog(seedCatalog());
  // DB のハンドルは getDb() が保持するので、ここでは接続せず port だけ作る
  const neonCatalog = createNeonCatalog();
  const fakePlanner = createFakePlanner();
  const fakeMandate = createFakeMandate({
    mandates: [],
    ids: resources.mandateIds,
  });
  const realMandate = createRealMandate({
    mandates: [],
    ids: resources.mandateIds,
    deps: {
      payToken,
      settlementRecipient: () => resources.env.MANDATE_SETTLEMENT_RECIPIENT,
    },
  });
  const fakeStore = createFakeStore();

  return {
    calendar: { real: googleCalendarFor, fake: () => fakeCalendar },
    catalog: { real: () => neonCatalog, fake: () => fakeCatalog },
    planner: { real: () => fakePlanner, fake: () => fakePlanner },
    mandate: { real: () => realMandate, fake: () => fakeMandate },
    store: { real: () => fakeStore, fake: () => fakeStore },
    newTripId: resources.newTripId,
  };
};
