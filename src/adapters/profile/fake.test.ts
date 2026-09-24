import { describe, expect, test } from "vitest";
import type { IsoDate, IsoDateTime, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
  parseUserId,
} from "@/domain/identifiers.parse";
import type { TravelerPreferences } from "@/domain/plan";
import type {
  ProfileOwner,
  ProfilePort,
  ProfileSettingsPort,
} from "@/domain/profile";
import type { ProfileSaveInput } from "@/features/profile/schemas";
import { createFakeProfile } from "./fake";

const date = (raw: string): IsoDate => {
  return mustParse(parseIsoDate(raw));
};

const userId = (raw: string): UserId => {
  return mustParse(parseUserId(raw));
};

describe("createFakeProfile", () => {
  test("どのユーザにも同じ生年月日を返す", async () => {
    const profile = createFakeProfile({ birthDate: date("2006-09-21") });

    expect(await profile.readBirthDate(userId("user-1"))).toStrictEqual({
      ok: true,
      value: "2006-09-21",
    });
    expect(await profile.readBirthDate(userId("user-2"))).toStrictEqual({
      ok: true,
      value: "2006-09-21",
    });
  });

  test("seed に生年月日が無ければ未登録になる", async () => {
    const profile = createFakeProfile({});

    expect(await profile.readBirthDate(userId("user-1"))).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("どのユーザにも同じ好みを返す", async () => {
    const preferences: TravelerPreferences = {
      homeStation: "東京",
      preferredTransport: "rail",
      diningGenres: ["居酒屋"],
      leisureGenres: ["history"],
    };
    const profile = createFakeProfile({ preferences });

    expect(await profile.readPreferences(userId("user-1"))).toStrictEqual({
      ok: true,
      value: preferences,
    });
    expect(await profile.readPreferences(userId("user-2"))).toStrictEqual({
      ok: true,
      value: preferences,
    });
  });

  test("seed に好みが無ければ未登録になる", async () => {
    const profile = createFakeProfile({});

    expect(await profile.readPreferences(userId("user-1"))).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });
});

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const SEEDED_AT = at("2026-09-20T00:00:00.000Z");

const SAVED_AT = at("2026-09-21T00:00:00.000Z");

const DEMO_PREFERENCES: TravelerPreferences = {
  homeStation: "東京",
  preferredTransport: "rail",
  diningGenres: ["居酒屋"],
  leisureGenres: ["history"],
};

const seeded = (): ProfilePort & ProfileSettingsPort => {
  return createFakeProfile({
    birthDate: date("2006-09-21"),
    preferences: DEMO_PREFERENCES,
    email: "dev@example.com",
    seededAt: SEEDED_AT,
    now: () => SAVED_AT,
  });
};

const OWNER: ProfileOwner = {
  userId: userId("user-1"),
  email: "u1@example.com",
};

const saveInput = (updatedAt: string | undefined): ProfileSaveInput => {
  return {
    fullName: "山田 太郎",
    address: null,
    birthDate: "2000-01-02",
    residencePref: null,
    homeCity: "東京",
    homeSpot: "品川",
    diningGenres: ["和食"],
    leisureGenres: [],
    budget: 50000,
    priority: "price",
    walletAddress: null,
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
};

describe("createFakeProfile の設定画面", () => {
  test("seed から組み立てた 1 つのプロフィールをどのユーザにも返す", async () => {
    const profile = seeded();

    const dto = await profile.readProfile(userId("user-1"));

    expect(dto).toStrictEqual({
      ok: true,
      value: {
        email: "dev@example.com",
        fullName: null,
        address: null,
        birthDate: "2006-09-21",
        residencePref: null,
        homeCity: "東京",
        homeSpot: null,
        diningGenres: ["居酒屋"],
        leisureGenres: ["history"],
        budget: null,
        priority: null,
        walletAddress: null,
        updatedAt: "2026-09-20T00:00:00.000Z",
      },
    });
    expect(await profile.readProfile(userId("user-2"))).toStrictEqual(dto);
    expect(await profile.readPlanningProfile(userId("user-1"))).toStrictEqual({
      ok: true,
      value: {
        birthDate: "2006-09-21",
        nationality: null,
        residencePref: null,
        homeCity: "東京",
        homeSpot: null,
        diningGenres: ["居酒屋"],
        leisureGenres: ["history"],
        budget: null,
        priority: null,
      },
    });
  });

  test("seed が空なら未登録になる", async () => {
    const profile = createFakeProfile({});

    expect(await profile.readProfile(userId("user-1"))).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(await profile.readPlanningProfile(userId("user-1"))).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("保存すると同じユーザの読み取りすべてに反映され、他のユーザは seed のまま", async () => {
    const profile = seeded();

    const saved = await profile.saveProfile(
      OWNER,
      saveInput("2026-09-20T00:00:00.000Z"),
    );

    expect(saved).toStrictEqual({
      ok: true,
      value: {
        email: "u1@example.com",
        fullName: "山田 太郎",
        address: null,
        birthDate: "2000-01-02",
        residencePref: null,
        homeCity: "東京",
        homeSpot: "品川",
        diningGenres: ["和食"],
        leisureGenres: [],
        budget: 50000,
        priority: "price",
        walletAddress: null,
        updatedAt: "2026-09-21T00:00:00.000Z",
      },
    });
    expect(await profile.readProfile(OWNER.userId)).toStrictEqual(saved);
    expect(await profile.readBirthDate(OWNER.userId)).toStrictEqual({
      ok: true,
      value: "2000-01-02",
    });
    // 保存後の好みは real と同じ導き方 (出発地は起点、優先は notes)
    expect(await profile.readPreferences(OWNER.userId)).toStrictEqual({
      ok: true,
      value: {
        homeStation: "品川",
        diningGenres: ["和食"],
        leisureGenres: [],
        notes: "price",
      },
    });
    expect(await profile.readBirthDate(userId("user-2"))).toStrictEqual({
      ok: true,
      value: "2006-09-21",
    });
  });

  test("取得時の updatedAt が食い違えば conflict", async () => {
    const profile = seeded();

    expect(
      await profile.saveProfile(OWNER, saveInput("2020-01-01T00:00:00.000Z")),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
  });

  test("未登録のユーザは updatedAt 無しで作れ、2 度目は conflict", async () => {
    const profile = createFakeProfile({ now: () => SAVED_AT });

    const created = await profile.saveProfile(OWNER, saveInput(undefined));

    expect(created.ok && created.value.updatedAt).toBe(
      "2026-09-21T00:00:00.000Z",
    );
    expect(
      await profile.saveProfile(OWNER, saveInput(undefined)),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
    expect(
      await profile.saveProfile(
        { ...OWNER, userId: userId("user-2") },
        saveInput("2026-09-21T00:00:00.000Z"),
      ),
    ).toStrictEqual({ ok: false, error: { kind: "notFound" } });
  });
});
