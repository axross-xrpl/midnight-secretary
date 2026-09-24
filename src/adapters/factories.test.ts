import { describe, expect, test } from "vitest";
import { sequentialTripIds, testCatalogIds } from "@/testing/ids";
import { DEMO_SOURCES } from "@/application/sources";
import type { RequestContext } from "@/application/wiring";
import { buildSecretaryDeps } from "@/application/wiring";
import type { OfferQuery } from "@/domain/catalog";
import type { IsoDate, IsoDateTime, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseMandateId,
  parseUserId,
} from "@/domain/identifiers.parse";
import type { ProfileSaveInput } from "@/features/profile/schemas";
import type {
  TransportServiceDetailDto,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import type { CatalogSettingsPort } from "@/features/services/settings-port";
import type { Result } from "@/lib/result";
import { DEV_USER } from "./auth/dev";
import type { ProcessResources } from "./factories";
import { buildSettingsDeps, createProcessFactories } from "./factories";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const date = (raw: string): IsoDate => {
  return mustParse(parseIsoDate(raw));
};

const STARTED_AT = at("2026-09-24T00:00:00.000Z");

const SAVED_AT = at("2026-09-24T01:00:00.000Z");

const DEMO_BIRTH_DATE = date("2006-10-01");

const USER: UserId = mustParse(parseUserId("user-1"));

const CONTEXT: RequestContext = { now: SAVED_AT };

const OSAKA_TWO_NIGHTS: OfferQuery = {
  origin: "東京",
  destination: "大阪",
  departOn: date("2026-10-14"),
  returnOn: date("2026-10-16"),
};

// 採番と時計はテスト設定に閉じているので、閉じたカウンタと止まった時計で作る
// real の adapter も作られるが、呼ばない限り外には出ない
const testResources = (): ProcessResources => {
  const state = { events: 0 };
  const catalogIds = testCatalogIds(SAVED_AT);

  return {
    env: {},
    startedAt: STARTED_AT,
    demoBirthDate: DEMO_BIRTH_DATE,
    newTripId: sequentialTripIds(),
    newEventId: () => {
      state.events = state.events + 1;

      return mustParse(parseCalendarEventId(`seed-${state.events}`));
    },
    newServiceId: catalogIds.newServiceId,
    clock: catalogIds.now,
    mandateIds: {
      newMandateId: () => mustParse(parseMandateId("mandate-1")),
      newCommitment: () => "commitment-1",
      newTransactionId: () => "tx-1",
      hashAuthorization: (id, ref) => `hash:${id}:${ref}`,
    },
    identityIds: {
      identityOf: (id) => `identity:${id}`,
      newProofRef: () => "proof-1",
    },
  };
};

// demo と同じく全部 fake の source で、秘書と設定画面の deps を同じファクトリから組み立てる
const demoDeps = () => {
  const factories = createProcessFactories(testResources());

  return {
    secretary: buildSecretaryDeps(DEMO_SOURCES, factories.secretary, CONTEXT),
    settings: buildSettingsDeps(DEMO_SOURCES, factories.settings, CONTEXT),
  };
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

// 一覧の code から詳細を引く (無ければテスト設定の誤りなので throw)
const mustTransport = async (
  catalog: CatalogSettingsPort,
  code: string,
): Promise<TransportServiceDetailDto> => {
  const listed = mustOk(await catalog.listServices({ query: code })).at(0);

  if (listed === undefined) {
    throw new Error(`test: no service ${code}`);
  }

  const detail = mustOk(await catalog.getTransportService(listed.id));

  if (detail === undefined) {
    throw new Error(`test: no transport ${code}`);
  }

  return detail;
};

// 画面は詳細を読んで編集するので、読んだ行をそのまま更新の入力にする
const updateInputOf = (
  detail: TransportServiceDetailDto,
): TransportServiceUpdateInput => {
  return {
    mode: detail.mode,
    code: detail.code,
    name: detail.name,
    fromCity: detail.fromCity,
    toCity: detail.toCity,
    fromSpot: detail.fromSpot,
    toSpot: detail.toSpot,
    departTime: detail.departTime,
    arriveTime: detail.arriveTime,
    durationMin: detail.durationMin,
    price: detail.price,
    originAccessMin: detail.originAccessMin,
    boardingBufferMin: detail.boardingBufferMin,
    arrivalBufferMin: detail.arrivalBufferMin,
    destinationAccessMin: detail.destinationAccessMin,
    accessFare: detail.accessFare,
    seatClass: detail.seatClass,
    walletAddress: detail.walletAddress,
    active: detail.active,
    updatedAt: detail.updatedAt,
  };
};

const PROFILE_INPUT: ProfileSaveInput = {
  fullName: null,
  address: null,
  birthDate: "1990-04-01",
  residencePref: null,
  homeCity: "東京",
  homeSpot: "東京",
  diningGenres: ["居酒屋"],
  leisureGenres: ["history"],
  budget: null,
  priority: null,
  walletAddress: null,
};

describe("createProcessFactories の fake", () => {
  test("設定画面のカタログで料金を変えると、秘書のカタログの findOffers に効く", async () => {
    const { secretary, settings } = demoDeps();
    const hikari = await mustTransport(settings.catalog, "rail-hikari-505");

    mustOk(
      await settings.catalog.updateTransportService(hikari.id, {
        ...updateInputOf(hikari),
        price: 20000,
      }),
    );

    const offers = mustOk(await secretary.catalog.findOffers(OSAKA_TWO_NIGHTS));

    expect(
      offers.outbound.find((offer) => offer.id === "rail-hikari-505")?.price,
    ).toStrictEqual({ amount: 20000, currency: "MST" });
  });

  test("設定画面で保存した生年月日が、秘書のプロフィールの readBirthDate に出る", async () => {
    const { secretary, settings } = demoDeps();
    const seeded = mustOk(await settings.profile.readProfile(USER));

    mustOk(
      await settings.profile.saveProfile(
        { userId: USER, email: "user-1@example.com" },
        { ...PROFILE_INPUT, updatedAt: seeded?.updatedAt },
      ),
    );

    expect(await secretary.profile.readBirthDate(USER)).toStrictEqual({
      ok: true,
      value: "1990-04-01",
    });
  });

  test("demo のプロフィールの行は dev ユーザのメールアドレスと起動日から決めた生年月日を持ち、秘書には移す前と同じ好みに見える", async () => {
    const { secretary, settings } = demoDeps();

    expect(await settings.profile.readProfile(USER)).toStrictEqual({
      ok: true,
      value: {
        email: DEV_USER.email,
        fullName: null,
        address: null,
        birthDate: "2006-10-01",
        residencePref: null,
        homeCity: "東京",
        homeSpot: "東京",
        diningGenres: ["居酒屋"],
        leisureGenres: ["history"],
        budget: null,
        priority: null,
        walletAddress: null,
        updatedAt: STARTED_AT,
      },
    });
    expect(await secretary.profile.readBirthDate(USER)).toStrictEqual({
      ok: true,
      value: "2006-10-01",
    });
    expect(await secretary.profile.readPreferences(USER)).toStrictEqual({
      ok: true,
      value: {
        homeStation: "東京",
        preferredTransport: "rail",
        diningGenres: ["居酒屋"],
        leisureGenres: ["history"],
      },
    });
  });
});
