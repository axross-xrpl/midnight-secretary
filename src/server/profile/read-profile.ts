import "server-only";

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { placeServices, transportServices, userProfiles } from "@/db/schema";
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type { ProfileDto } from "@/features/profile/schemas";

/**
 * 自分のプロフィールを読む
 *
 * 行が無ければ未登録。画面は空のフォームを出す
 */
export async function readProfile(userId: string): Promise<ProfileDto | null> {
  const [row] = await getDb()
    .select({
      email: userProfiles.email,
      fullName: userProfiles.fullName,
      address: userProfiles.address,
      birthDate: userProfiles.birthDate,
      residencePref: userProfiles.residencePref,
      homeCity: userProfiles.homeCity,
      homeSpot: userProfiles.homeSpot,
      diningGenres: userProfiles.diningGenres,
      leisureGenres: userProfiles.leisureGenres,
      budgetJpyc: userProfiles.budgetJpyc,
      priority: userProfiles.priority,
      updatedAt: userProfiles.updatedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (row === undefined) {
    return null;
  }

  return {
    ...row,
    priority: row.priority as ProfileDto["priority"],
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 拠点として選べる都市と起点
 *
 * 自由入力にすると交通が1件も当たらない設定を作れてしまうので、
 * 登録済みの交通の有効行から導出する (`register-page-spec.md` §9 と同じ考え方)
 */
export async function readHomeOptions(): Promise<HomeOption[]> {
  const rows = await getDb()
    .selectDistinct({
      city: transportServices.fromCity,
      spot: transportServices.fromSpot,
    })
    .from(transportServices)
    .where(eq(transportServices.active, true))
    .orderBy(asc(transportServices.fromCity), asc(transportServices.fromSpot));

  const byCity = new Map<string, string[]>();

  for (const { city, spot } of rows) {
    const spots = byCity.get(city);

    if (spots === undefined) {
      byCity.set(city, [spot]);
    } else {
      spots.push(spot);
    }
  }

  return [...byCity].map(([city, spots]) => ({ city, spots }));
}

/**
 * 好み・趣味に選べるジャンル
 *
 * `place_services.genre` と突き合わせるので、選択肢も同じ列から出す
 */
export async function readGenreOptions(): Promise<GenreOptions> {
  const rows = await getDb()
    .selectDistinct({
      kind: placeServices.kind,
      genre: placeServices.genre,
    })
    .from(placeServices)
    .where(
      and(
        eq(placeServices.active, true),
        isNotNull(placeServices.genre),
        inArray(placeServices.kind, ["restaurant", "leisure"]),
      ),
    )
    .orderBy(asc(placeServices.genre));

  const pick = (kind: string): string[] =>
    rows
      .filter((row) => row.kind === kind && row.genre !== null)
      .map((row) => row.genre as string);

  return { dining: pick("restaurant"), leisure: pick("leisure") };
}
