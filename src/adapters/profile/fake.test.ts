import { describe, expect, test } from "vitest";
import type { IsoDateTime, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDateTime,
  parseUserId,
} from "@/domain/identifiers.parse";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import type { ProfileOwner } from "@/features/profile/settings-port";
import type { Result } from "@/lib/result";
import type { FakeProfileSeed } from "./fake";
import { createFakeProfile } from "./fake";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const userId = (raw: string): UserId => {
  return mustParse(parseUserId(raw));
};

const SEEDED_AT = at("2026-09-24T00:00:00.000Z");

const SAVED_AT = at("2026-09-24T01:00:00.000Z");

const USER_1 = userId("user-1");

const USER_2 = userId("user-2");

const OWNER_1: ProfileOwner = { userId: USER_1, email: "user-1@example.com" };

const SEED_PROFILE: ProfileDto = {
  email: "dev@example.com",
  fullName: null,
  address: null,
  birthDate: "2006-09-21",
  residencePref: null,
  homeCity: "東京",
  homeSpot: "東京",
  diningGenres: ["居酒屋"],
  leisureGenres: ["history"],
  budget: null,
  priority: null,
  walletAddress: null,
  updatedAt: SEEDED_AT,
};

const INPUT: ProfileSaveInput = {
  fullName: "山田 花子",
  address: null,
  birthDate: "1990-04-01",
  residencePref: "東京都",
  homeCity: "東京",
  homeSpot: "品川",
  diningGenres: ["中華"],
  leisureGenres: ["art"],
  budget: 50000,
  priority: "price",
  walletAddress: null,
};

// 保存の時計は、seed の行の時刻より後の止まった時刻にする
const seedWith = (profile: ProfileDto | undefined): FakeProfileSeed => {
  return { profile, now: () => SAVED_AT };
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

describe("createFakeProfile の設定画面の面", () => {
  test("seed の行があれば、どのユーザにもその行を返す", async () => {
    const profile = createFakeProfile(seedWith(SEED_PROFILE));

    expect(await profile.readProfile(USER_1)).toStrictEqual({
      ok: true,
      value: SEED_PROFILE,
    });
    expect(await profile.readProfile(USER_2)).toStrictEqual({
      ok: true,
      value: SEED_PROFILE,
    });
  });

  test("seed の行が無ければ未登録になる", async () => {
    const profile = createFakeProfile(seedWith(undefined));

    expect(await profile.readProfile(USER_1)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("新規の保存は持ち主のメールアドレスと今の時刻で行を作る", async () => {
    const profile = createFakeProfile(seedWith(undefined));
    const expected: ProfileDto = {
      email: "user-1@example.com",
      ...INPUT,
      updatedAt: SAVED_AT,
    };

    expect(await profile.saveProfile(OWNER_1, INPUT)).toStrictEqual({
      ok: true,
      value: expected,
    });
    expect(await profile.readProfile(USER_1)).toStrictEqual({
      ok: true,
      value: expected,
    });
  });

  test("保存済みのユーザにもう一度新規で保存すると conflict になる", async () => {
    const profile = createFakeProfile(seedWith(undefined));

    mustOk(await profile.saveProfile(OWNER_1, INPUT));

    expect(await profile.saveProfile(OWNER_1, INPUT)).toStrictEqual({
      ok: false,
      error: { kind: "conflict" },
    });
  });

  test("seed の行の updatedAt で更新でき、メールアドレスは seed の行のまま", async () => {
    const profile = createFakeProfile(seedWith(SEED_PROFILE));

    expect(
      await profile.saveProfile(OWNER_1, {
        ...INPUT,
        updatedAt: SEED_PROFILE.updatedAt,
      }),
    ).toStrictEqual({
      ok: true,
      value: { email: "dev@example.com", ...INPUT, updatedAt: SAVED_AT },
    });
  });

  test("読んだ行の updatedAt で更新でき、古い updatedAt は conflict になる", async () => {
    const profile = createFakeProfile(seedWith(undefined));
    const created = mustOk(await profile.saveProfile(OWNER_1, INPUT));

    expect(
      await profile.saveProfile(OWNER_1, {
        ...INPUT,
        budget: 60000,
        updatedAt: created.updatedAt,
      }),
    ).toStrictEqual({
      ok: true,
      value: { ...created, budget: 60000 },
    });
    expect(
      await profile.saveProfile(OWNER_1, {
        ...INPUT,
        updatedAt: SEEDED_AT,
      }),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
  });

  test("行が無いユーザを updatedAt 付きで保存すると notFound になる", async () => {
    const profile = createFakeProfile(seedWith(undefined));

    expect(
      await profile.saveProfile(OWNER_1, { ...INPUT, updatedAt: SEEDED_AT }),
    ).toStrictEqual({ ok: false, error: { kind: "notFound" } });
  });
});

describe("設定画面の保存が秘書の読み取りに効く", () => {
  test("生年月日を保存するとそのユーザの readBirthDate に出て、別のユーザは seed のまま", async () => {
    const profile = createFakeProfile(seedWith(SEED_PROFILE));

    mustOk(
      await profile.saveProfile(OWNER_1, {
        ...INPUT,
        updatedAt: SEED_PROFILE.updatedAt,
      }),
    );

    expect(await profile.readBirthDate(USER_1)).toStrictEqual({
      ok: true,
      value: "1990-04-01",
    });
    expect(await profile.readBirthDate(USER_2)).toStrictEqual({
      ok: true,
      value: "2006-09-21",
    });
  });

  test("生年月日が空の行と行が無いユーザは、どちらも生年月日が未登録になる", async () => {
    const withoutBirthDate = createFakeProfile(
      seedWith({ ...SEED_PROFILE, birthDate: null }),
    );
    const withoutProfile = createFakeProfile(seedWith(undefined));

    expect(await withoutBirthDate.readBirthDate(USER_1)).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(await withoutProfile.readBirthDate(USER_1)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("保存した起点とジャンルが readPreferences に出る", async () => {
    const profile = createFakeProfile(seedWith(SEED_PROFILE));

    expect(await profile.readPreferences(USER_1)).toStrictEqual({
      ok: true,
      value: {
        homeStation: "東京",
        diningGenres: ["居酒屋"],
        leisureGenres: ["history"],
      },
    });

    mustOk(
      await profile.saveProfile(OWNER_1, {
        ...INPUT,
        updatedAt: SEED_PROFILE.updatedAt,
      }),
    );

    expect(await profile.readPreferences(USER_1)).toStrictEqual({
      ok: true,
      value: {
        homeStation: "品川",
        diningGenres: ["中華"],
        leisureGenres: ["art"],
        notes: "price",
      },
    });
  });

  test("seed の交通手段の好みは行から取った好みに付き、行が無ければ好みも無い", async () => {
    const withProfile = createFakeProfile({
      ...seedWith(SEED_PROFILE),
      preferredTransport: "rail",
    });
    const withoutProfile = createFakeProfile({
      ...seedWith(undefined),
      preferredTransport: "rail",
    });

    expect(await withProfile.readPreferences(USER_1)).toStrictEqual({
      ok: true,
      value: {
        homeStation: "東京",
        preferredTransport: "rail",
        diningGenres: ["居酒屋"],
        leisureGenres: ["history"],
      },
    });
    expect(await withoutProfile.readPreferences(USER_1)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });
});
