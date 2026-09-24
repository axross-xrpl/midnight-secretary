import { createHash, randomUUID } from "node:crypto";
import type { SecretaryDeps } from "@/application/deps";
import type { EnvLike, PortSources, SourcesError } from "@/application/sources";
import { parsePortSources, SOURCE_ENV_KEYS } from "@/application/sources";
import type { RequestContext, SecretaryFactories } from "@/application/wiring";
import { buildSecretaryDeps } from "@/application/wiring";
import { addDays, yearsBefore } from "@/domain/dates";
import {
  mustParse,
  parseCalendarEventId,
  parseIsoDateTime,
  parseMandateId,
  parseTripId,
} from "@/domain/identifiers.parse";
import type { SettingsDeps, SettingsFactories } from "./factories";
import { buildSettingsDeps, createProcessFactories } from "./factories";
import { jstDateOf } from "./jst";

/**
 * プロセスごとに 1 回作るもの全部で、解決済みの source と port の factory
 */
export type SecretaryRuntime = {
  sources: PortSources;
  factories: SecretaryFactories;
  settingsFactories: SettingsFactories;
};

type RuntimeSlot = {
  secretaryRuntime?: SecretaryRuntime;
};

// globalThis には runtime 用の型付きの置き場が無いので、ここがパーサの外で唯一のキャスト
const slot = globalThis as RuntimeSlot;

// demo の予約者は起動日の 7 日後に 20 歳になる (seed の +6 日の出張は 20 歳前、+9 日の出張は 20 歳以上)
const DEMO_BIRTHDAY_IN_DAYS = 7;

const DEMO_ADULT_AGE = 20;

const describeSourcesError = (error: SourcesError): string => {
  if (error.kind === "invalidValue") {
    return `${error.key}=${error.value} is not one of ${error.allowed.join(", ")}`;
  }

  if (error.kind === "realCalendarNeedsGoogleAuth") {
    return `${SOURCE_ENV_KEYS.auth}=dev has no Google token: set ${SOURCE_ENV_KEYS.calendar}=fake or sign in with Google`;
  }

  return `${SOURCE_ENV_KEYS.auth}=dev only runs on localhost, but ${SOURCE_ENV_KEYS.nextAuthUrl}=${error.nextAuthUrl}`;
};

const createRuntime = (env: EnvLike): SecretaryRuntime => {
  const sources = parsePortSources(env);

  if (!sources.ok) {
    throw new Error(
      `invalid source configuration: ${describeSourcesError(sources.error)}`,
    );
  }

  const startedAt = mustParse(parseIsoDateTime(new Date().toISOString()));
  const factories = createProcessFactories({
    env,
    startedAt,
    demoBirthDate: yearsBefore(
      addDays(jstDateOf(startedAt), DEMO_BIRTHDAY_IN_DAYS),
      DEMO_ADULT_AGE,
    ),
    newTripId: () => mustParse(parseTripId(randomUUID())),
    newEventId: () => mustParse(parseCalendarEventId(`seed-${randomUUID()}`)),
    mandateIds: {
      newMandateId: () => mustParse(parseMandateId(`mandate-${randomUUID()}`)),
      newCommitment: () => randomUUID().replaceAll("-", ""),
      newTransactionId: () => `fake-tx-${randomUUID()}`,
      hashAuthorization: (mandateId, paymentRef) =>
        createHash("sha256").update(`${mandateId}:${paymentRef}`).digest("hex"),
    },
    identityIds: {
      // identity は公開されるので、ユーザ id をそのまま出さずハッシュにする
      identityOf: (userId) =>
        createHash("sha256").update(`age-id:${userId}`).digest("hex"),
      newProofRef: () => randomUUID(),
    },
  });

  return {
    sources: sources.value,
    factories: factories.secretary,
    settingsFactories: factories.settings,
  };
};

/**
 * プロセス全体の runtime を返し、初回の呼び出しで作る
 *
 * Next.js はサーバコンポーネントと Route Handler を別々にバンドルし、素のモジュール状態だと二重になるので globalThis にキャッシュする
 * source の変数が不正なら throw する
 * 設定ミスはプロセスを止めるべきで、劣化させて動かしてはいけない
 */
export const getSecretaryRuntime = (): SecretaryRuntime => {
  const running = slot.secretaryRuntime;

  if (running !== undefined) {
    return running;
  }

  const created = createRuntime(process.env);

  // fake は状態をメモリに持つので、全リクエストが同じ runtime に届く必要がある
  slot.secretaryRuntime = created;

  return created;
};

/**
 * runtime からリクエスト 1 件分の deps を組み立てる
 */
export const secretaryDepsFor = (context: RequestContext): SecretaryDeps => {
  const runtime = getSecretaryRuntime();

  return buildSecretaryDeps(runtime.sources, runtime.factories, context);
};

/**
 * runtime からリクエスト 1 件分の設定画面の deps を組み立てる
 */
export const settingsDepsFor = (context: RequestContext): SettingsDeps => {
  const runtime = getSecretaryRuntime();

  return buildSettingsDeps(runtime.sources, runtime.settingsFactories, context);
};
