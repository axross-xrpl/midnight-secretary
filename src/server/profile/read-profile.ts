import "server-only";

import type { CatalogManagementPort } from "@/domain/catalog";
import { mustParse, parseUserId } from "@/domain/identifiers.parse";
import type { ProfileSettingsPort } from "@/domain/profile";
import type { PlanningProfile } from "@/features/profile/feasibility";
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type { ProfileDto } from "@/features/profile/schemas";
import { unwrapOrThrow } from "../unwrap";

/**
 * 自分のプロフィールを読む
 *
 * 行が無ければ未登録。画面は空のフォームを出す
 * 読めなかったときは throw する (呼び出し側の try か Next のエラー画面に届く)
 */
export const readProfile = async (
  userId: string,
  profile: ProfileSettingsPort,
): Promise<ProfileDto | null> => {
  const read = await profile.readProfile(mustParse(parseUserId(userId)));

  return unwrapOrThrow(read) ?? null;
};

/**
 * 拠点として選べる都市と起点 (登録済みの交通の有効行から導く)
 */
export const readHomeOptions = async (
  catalog: CatalogManagementPort,
): Promise<HomeOption[]> => {
  return [...unwrapOrThrow(await catalog.listHomeOptions())];
};

/**
 * 好み・趣味に選べるジャンル (有効な飲食・レジャーの genre から導く)
 */
export const readGenreOptions = async (
  catalog: CatalogManagementPort,
): Promise<GenreOptions> => {
  return unwrapOrThrow(await catalog.listGenreOptions());
};

/**
 * 手配に使うプロフィールを読む
 *
 * 画面用の `readProfile` とは別に、本人確認の判定に要る `nationality` を含め、
 * 表示だけの項目は読まない
 */
export const readPlanningProfile = async (
  userId: string,
  profile: ProfileSettingsPort,
): Promise<PlanningProfile | null> => {
  const read = await profile.readPlanningProfile(
    mustParse(parseUserId(userId)),
  );

  return unwrapOrThrow(read) ?? null;
};
