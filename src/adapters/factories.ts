import type { NewTripId } from "@/application/deps";
import type { EnvLike } from "@/application/sources";
import type { RequestContext, SecretaryFactories } from "@/application/wiring";
import type { CalendarPort } from "@/domain/calendar";
import type {
  CalendarEventId,
  IsoDate,
  IsoDateTime,
} from "@/domain/identifiers";
import { payToken } from "@/lib/dev-contracts/token";
import { payShieldedToken } from "@/lib/dev-contracts/shielded-token";
import { err } from "@/lib/result";
import { createFakeCalendar, seedCalendarEvents } from "./calendar/fake";
import { createGoogleCalendar } from "./calendar/google";
import { createFakeCatalog, seedCatalog } from "./catalog/fake";
import { createNeonCatalog } from "./catalog/neon";
import type { FakeIdentityIds } from "./identity/fake";
import { createFakeIdentity } from "./identity/fake";
import type { FakeMandateIds } from "./mandate/fake";
import { createFakeMandate } from "./mandate/fake";
import { createRealMandate } from "./mandate/real";
import { createFakePlanner } from "./planner/fake";
import { createGeminiPlanner } from "./planner/gemini";
import { DEFAULT_GEMINI_MODEL, geminiGenerate } from "./planner/gemini-client";
import { createFakeProfile } from "./profile/fake";
import { createNeonProfile } from "./profile/neon";
import { createFakeStore } from "./store/fake";
import { createNeonStore } from "./store/neon";

/**
 * adapter に渡すプロセス全体の入力で、環境変数と開始時刻と id の生成関数
 *
 * id は非決定的なので注入する
 * `demoBirthDate` は Fake のプロフィールが全ユーザに返す生年月日で、起動日から決める
 * 各レーンは自分の adapter が入るときに自分のフィールドを追加する
 */
export type ProcessResources = {
  env: EnvLike;
  startedAt: IsoDateTime;
  demoBirthDate: IsoDate;
  newTripId: NewTripId;
  newEventId: () => CalendarEventId;
  mandateIds: FakeMandateIds;
  identityIds: FakeIdentityIds;
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

// 環境変数の空文字は未設定と同じに扱う
const envValue = (raw: string | undefined): string | undefined => {
  if (raw === undefined || raw === "") {
    return undefined;
  }

  return raw;
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
  // 鍵が無くても作れる (呼ばれたときに llm の失敗を返す)
  const geminiPlanner = createGeminiPlanner({
    generate: geminiGenerate(
      envValue(resources.env.GEMINI_API_KEY),
      envValue(resources.env.GEMINI_MODEL) ?? DEFAULT_GEMINI_MODEL,
    ),
  });
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
      payShieldedToken,
      shieldedSettlementRecipient: () =>
        resources.env.MANDATE_SETTLEMENT_RECIPIENT_SHIELDED,
    },
  });
  const fakeStore = createFakeStore();
  // 進行中の出張はメモリのまま、確定旅程だけ Neon に写す (接続は listConfirmedTrips / putConfirmedTrip の getDb() が持つ)
  const neonStore = createNeonStore({ memory: fakeStore });
  const fakeIdentity = createFakeIdentity({ ids: resources.identityIds });
  const fakeProfile = createFakeProfile({
    birthDate: resources.demoBirthDate,
  });
  // カタログと同じく、接続は readProfile の getDb() が持つ
  const neonProfile = createNeonProfile();

  return {
    calendar: { real: googleCalendarFor, fake: () => fakeCalendar },
    catalog: { real: () => neonCatalog, fake: () => fakeCatalog },
    planner: { real: () => geminiPlanner, fake: () => fakePlanner },
    mandate: { real: () => realMandate, fake: () => fakeMandate },
    store: { real: () => neonStore, fake: () => fakeStore },
    identity: { real: () => fakeIdentity, fake: () => fakeIdentity },
    profile: { real: () => neonProfile, fake: () => fakeProfile },
    newTripId: resources.newTripId,
  };
};
