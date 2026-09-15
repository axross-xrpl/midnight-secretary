import { describe, expect, test } from "vitest";
import type { IsoDate, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseUserId,
} from "@/domain/identifiers.parse";
import type { TravelerPreferences } from "@/domain/plan";
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
