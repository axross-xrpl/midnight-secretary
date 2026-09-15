import "server-only";

import type { IsoDate } from "@/domain/identifiers";
import { parseIsoDate } from "@/domain/identifiers.parse";
import type { TravelerPreferences } from "@/domain/plan";
import type {
  ProfileError,
  ProfilePort,
  ReadBirthDate,
  ReadPreferences,
} from "@/domain/profile";
import type { ProfileDto } from "@/features/profile/schemas";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";
import { readProfile } from "@/server/profile/read-profile";

// 暦日として読めない値は行の形の問題として報告し、値そのものは失敗に載せない
const INVALID_BIRTH_DATE: ProfileError = {
  kind: "schema",
  issues: [{ path: ["birthDate"], message: "invalid" }],
};

const unavailable = (cause: unknown): ProfileError => {
  return { kind: "unavailable", cause };
};

// 行が無い (null) と生年月日が空 (null) はどちらも未登録で、undefined に畳む
// 列は date 型なので YYYY-MM-DD で届くが、境界なので形を確かめてから brand を付ける
const birthDateOf = (
  profile: ProfileDto | null,
): Result<IsoDate | undefined, ProfileError> => {
  if (profile === null || profile.birthDate === null) {
    return ok(undefined);
  }

  const birthDate = parseIsoDate(profile.birthDate);

  if (!birthDate.ok) {
    return err(INVALID_BIRTH_DATE);
  }

  return ok(birthDate.value);
};

const readBirthDate: ReadBirthDate = async (userId) => {
  const profile = await fromPromise(readProfile(userId), unavailable);

  if (!profile.ok) {
    return profile;
  }

  return birthDateOf(profile.value);
};

// 行が無ければ好みも無い (未登録)
// 出発地は起点 (home_spot) があればそれ、無ければ都市 (home_city) を使う
// 交通手段の列はプロフィールに無いので付けない
const preferencesOf = (
  profile: ProfileDto | null,
): TravelerPreferences | undefined => {
  if (profile === null) {
    return undefined;
  }

  return {
    homeStation: profile.homeSpot ?? profile.homeCity,
    diningGenres: profile.diningGenres,
    leisureGenres: profile.leisureGenres,
    ...(profile.priority === null ? {} : { notes: profile.priority }),
  };
};

const readPreferences: ReadPreferences = async (userId) => {
  const profile = await fromPromise(readProfile(userId), unavailable);

  if (!profile.ok) {
    return profile;
  }

  return ok(preferencesOf(profile.value));
};

/**
 * NeonDB のプロフィール (#16 の `user_profiles`) から生年月日と好みを読む
 *
 * `DATABASE_URL` の扱いは `readProfile` (drizzle) に任せ、接続や問い合わせの失敗は `unavailable` にする
 * 読むだけで、プロフィール画面の書き込みには触れない
 */
export const createNeonProfile = (): ProfilePort => {
  return { readBirthDate, readPreferences };
};
