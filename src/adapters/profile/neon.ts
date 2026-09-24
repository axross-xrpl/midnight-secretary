import "server-only";

import type {
  ProfilePort,
  ReadBirthDate,
  ReadPreferences,
} from "@/domain/profile";
import { ok } from "@/lib/result";
import { birthDateOf, preferencesOf } from "./dto";
import { createNeonProfileSettings } from "./neon-settings";

/**
 * NeonDB のプロフィール (#16 の `user_profiles`) から生年月日と好みを読む
 *
 * 設定画面の port と同じ読み取りを使い、画面が読む行から `dto.ts` の導き方で取り出す
 * `DATABASE_URL` の扱いは設定画面の port (drizzle) に任せ、接続や問い合わせの失敗は `unavailable` にする
 * 読むだけで、プロフィール画面の書き込みには触れない
 */
export const createNeonProfile = (): ProfilePort => {
  const { readProfile } = createNeonProfileSettings();

  const readBirthDate: ReadBirthDate = async (userId) => {
    const profile = await readProfile(userId);

    if (!profile.ok) {
      return profile;
    }

    return birthDateOf(profile.value);
  };

  const readPreferences: ReadPreferences = async (userId) => {
    const profile = await readProfile(userId);

    if (!profile.ok) {
      return profile;
    }

    return ok(preferencesOf(profile.value));
  };

  return { readBirthDate, readPreferences };
};
