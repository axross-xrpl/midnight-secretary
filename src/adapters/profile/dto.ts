import type { IsoDate } from "@/domain/identifiers";
import { parseIsoDate } from "@/domain/identifiers.parse";
import type { TravelerPreferences } from "@/domain/plan";
import type { ProfileError } from "@/domain/profile";
import type { PlanningProfile } from "@/features/profile/feasibility";
import type { ProfileDto } from "@/features/profile/schemas";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

// 暦日として読めない値は行の形の問題として報告し、値そのものは失敗に載せない
const INVALID_BIRTH_DATE: ProfileError = {
  kind: "schema",
  issues: [{ path: ["birthDate"], message: "invalid" }],
};

/**
 * 画面用のプロフィールから生年月日を取り出す
 *
 * 行が無い (undefined) と生年月日が空 (null) はどちらも未登録で、undefined に畳む
 * 列は date 型なので YYYY-MM-DD で届くが、境界なので形を確かめてから brand を付ける
 */
export const birthDateOf = (
  profile: ProfileDto | undefined,
): Result<IsoDate | undefined, ProfileError> => {
  if (profile === undefined || profile.birthDate === null) {
    return ok(undefined);
  }

  const birthDate = parseIsoDate(profile.birthDate);

  if (!birthDate.ok) {
    return err(INVALID_BIRTH_DATE);
  }

  return ok(birthDate.value);
};

/**
 * 画面用のプロフィールから出張者の好みを導く
 *
 * 行が無ければ好みも無い (未登録)
 * 出発地は起点 (home_spot) があればそれ、無ければ都市 (home_city) を使う
 * 交通手段の列はプロフィールに無いので付けない
 */
export const preferencesOf = (
  profile: ProfileDto | undefined,
): TravelerPreferences | undefined => {
  if (profile === undefined) {
    return undefined;
  }

  return {
    homeStation: profile.homeSpot ?? profile.homeCity,
    diningGenres: profile.diningGenres,
    leisureGenres: profile.leisureGenres,
    ...(profile.priority === null ? {} : { notes: profile.priority }),
  };
};

/**
 * 画面用のプロフィールから手配用の項目を取り出す
 *
 * `nationality` は画面が持たないので、持つ adapter (Neon) が上書きする
 */
export const planningProfileOf = (profile: ProfileDto): PlanningProfile => {
  return {
    birthDate: profile.birthDate,
    nationality: null,
    residencePref: profile.residencePref,
    homeCity: profile.homeCity,
    homeSpot: profile.homeSpot,
    diningGenres: profile.diningGenres,
    leisureGenres: profile.leisureGenres,
    budget: profile.budget,
    priority: profile.priority,
  };
};
