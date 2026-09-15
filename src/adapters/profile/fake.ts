import type { IsoDate } from "@/domain/identifiers";
import type { ProfilePort } from "@/domain/profile";
import { ok } from "@/lib/result";

/**
 * Fake のプロフィールが全ユーザに返す生年月日
 *
 * 無ければ未登録として振る舞う
 */
export type FakeProfileSeed = {
  birthDate?: IsoDate;
};

/**
 * 固定値を返すプロフィール
 *
 * demo ではサーバ起動日から決めた生年月日 (`runtime.ts` の `demoBirthDate`) を全ユーザに返す
 */
export const createFakeProfile = (seed: FakeProfileSeed): ProfilePort => {
  return {
    readBirthDate: async () => ok(seed.birthDate),
  };
};
