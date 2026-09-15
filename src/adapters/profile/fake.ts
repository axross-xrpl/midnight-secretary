import type { IsoDate } from "@/domain/identifiers";
import type { TravelerPreferences } from "@/domain/plan";
import type { ProfilePort } from "@/domain/profile";
import { ok } from "@/lib/result";

/**
 * Fake のプロフィールが全ユーザに返す値
 *
 * 無ければ未登録として振る舞う
 */
export type FakeProfileSeed = {
  birthDate?: IsoDate;
  preferences?: TravelerPreferences;
};

/**
 * 固定値を返すプロフィール
 *
 * demo ではサーバ起動日から決めた生年月日 (`runtime.ts` の `demoBirthDate`) を全ユーザに返す
 */
export const createFakeProfile = (seed: FakeProfileSeed): ProfilePort => {
  return {
    readBirthDate: async () => ok(seed.birthDate),
    readPreferences: async () => ok(seed.preferences),
  };
};
