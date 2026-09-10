import type { TravelerPreferences } from "@/domain/plan";

/**
 * Wave 1 で全ユーザに使う出張者の好み
 *
 * 出発地は Fake の料金表 (`seedCatalog`) の出発地と同じ東京
 * プロフィール画面が入ったら store から読む
 */
export const WAVE1_PREFERENCES = {
  homeStation: "東京",
} as const satisfies TravelerPreferences;
