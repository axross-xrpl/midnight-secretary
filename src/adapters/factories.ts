import type { NewTripId } from "@/application/deps";
import type { EnvLike, PortSources } from "@/application/sources";
import type {
  PortFactories,
  RequestContext,
  SecretaryFactories,
} from "@/application/wiring";
import { selectPort } from "@/application/wiring";
import type { CalendarPort } from "@/domain/calendar";
import type {
  CalendarEventId,
  IsoDate,
  IsoDateTime,
} from "@/domain/identifiers";
import type { TravelerPreferences } from "@/domain/plan";
import type { ProfileSettingsPort } from "@/features/profile/settings-port";
import type { CatalogSettingsPort } from "@/features/services/settings-port";
import { payToken } from "@/lib/dev-contracts/token";
import { payShieldedToken } from "@/lib/dev-contracts/shielded-token";
import {
  proveAge,
  readAgeRegistration,
  registerAge,
} from "@/lib/dev-contracts/age-verification";
import { err } from "@/lib/result";
import { createFakeCalendar, seedCalendarEvents } from "./calendar/fake";
import { createGoogleCalendar } from "./calendar/google";
import { createFakeCatalog, seedCatalog } from "./catalog/fake";
import { createNeonCatalog } from "./catalog/neon";
import { createNeonCatalogSettings } from "./catalog/neon-settings";
import type { FakeIdentityIds } from "./identity/fake";
import { createFakeIdentity } from "./identity/fake";
import { createRealIdentity } from "./identity/real";
import type { FakeMandateIds } from "./mandate/fake";
import { createFakeMandate } from "./mandate/fake";
import { createRealMandate } from "./mandate/real";
import { createFakePlanner } from "./planner/fake";
import { createGeminiPlanner } from "./planner/gemini";
import { DEFAULT_GEMINI_MODEL, geminiGenerate } from "./planner/gemini-client";
import { createFakeProfile } from "./profile/fake";
import { createNeonProfile } from "./profile/neon";
import { createNeonProfileSettings } from "./profile/neon-settings";
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

/**
 * 設定画面の port の 2 通りの組み立て方
 */
export type SettingsFactories = {
  catalog: PortFactories<CatalogSettingsPort>;
  profile: PortFactories<ProfileSettingsPort>;
};

/**
 * プロセスごとに 1 回作るファクトリ全部
 *
 * fake は秘書と設定画面で同じインスタンスを共有する
 */
export type ProcessFactories = {
  secretary: SecretaryFactories;
  settings: SettingsFactories;
};

/**
 * 設定画面の deps
 */
export type SettingsDeps = {
  catalog: CatalogSettingsPort;
  profile: ProfileSettingsPort;
};

// demo のプロフィールが全ユーザに返す好み
// real のプロフィールと同じ絵になるよう、飲食は居酒屋、レジャーは history を好みに置く
const DEMO_PREFERENCES = {
  homeStation: "東京",
  preferredTransport: "rail",
  diningGenres: ["居酒屋"],
  leisureGenres: ["history"],
} as const satisfies TravelerPreferences;

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
export const createProcessFactories = (
  resources: ProcessResources,
): ProcessFactories => {
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
  // contract server への接続は各呼び出しが持つので、ここでは port だけ作る (`newProofRef` は Fake だけが使い、real は tx id を証明の参照にする)
  const realIdentity = createRealIdentity({
    readRegistration: readAgeRegistration,
    register: registerAge,
    prove: proveAge,
    accountRefOf: resources.identityIds.identityOf,
  });
  const fakeProfile = createFakeProfile({
    birthDate: resources.demoBirthDate,
    preferences: DEMO_PREFERENCES,
  });
  // カタログと同じく、接続は readProfile の getDb() が持つ
  const neonProfile = createNeonProfile();
  // 設定画面の読み書きも、接続は各呼び出しの getDb() が持つ
  const neonCatalogSettings = createNeonCatalogSettings();
  const neonProfileSettings = createNeonProfileSettings();

  return {
    secretary: {
      calendar: { real: googleCalendarFor, fake: () => fakeCalendar },
      catalog: { real: () => neonCatalog, fake: () => fakeCatalog },
      planner: { real: () => geminiPlanner, fake: () => fakePlanner },
      mandate: { real: () => realMandate, fake: () => fakeMandate },
      store: { real: () => neonStore, fake: () => fakeStore },
      identity: { real: () => realIdentity, fake: () => fakeIdentity },
      profile: { real: () => neonProfile, fake: () => fakeProfile },
      newTripId: resources.newTripId,
    },
    // TODO: fake は次のコミットで秘書と共有する fake に向ける (今は移す前と同じく fake でも Neon を読む)
    settings: {
      catalog: {
        real: () => neonCatalogSettings,
        fake: () => neonCatalogSettings,
      },
      profile: {
        real: () => neonProfileSettings,
        fake: () => neonProfileSettings,
      },
    },
  };
};

/**
 * 解決済みの source から設定画面の deps を組み立てる
 *
 * catalog は `SECRETARY_CATALOG`、profile は `SECRETARY_PROFILE` に従う (秘書と同じ source)
 */
export const buildSettingsDeps = (
  sources: PortSources,
  factories: SettingsFactories,
  context: RequestContext,
): SettingsDeps => {
  return {
    catalog: selectPort(sources.catalog, factories.catalog, context),
    profile: selectPort(sources.profile, factories.profile, context),
  };
};
