import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { userProfiles } from "@/db/schema";
import type { PlanningProfile } from "@/features/profile/feasibility";

/**
 * 手配に使うプロフィールを読む
 *
 * 画面用の `readProfile` とは別に、本人確認の判定に要る `nationality` を含め、
 * 表示だけの項目は読まない
 */
export async function readPlanningProfile(
  userId: string,
): Promise<PlanningProfile | null> {
  const [row] = await getDb()
    .select({
      birthDate: userProfiles.birthDate,
      nationality: userProfiles.nationality,
      residencePref: userProfiles.residencePref,
      homeCity: userProfiles.homeCity,
      homeSpot: userProfiles.homeSpot,
      diningGenres: userProfiles.diningGenres,
      leisureGenres: userProfiles.leisureGenres,
      budget: userProfiles.budget,
      priority: userProfiles.priority,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (row === undefined) {
    return null;
  }

  return { ...row, priority: row.priority as PlanningProfile["priority"] };
}
