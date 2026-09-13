import type { TravelerPreferences } from "@/domain/plan";

/**
 * Wave 1 で全ユーザに使う出張者の好み
 *
 * 出発地は Fake の料金表 (`seedCatalog`) の出発地と同じ東京
 * 参考シナリオが新幹線なので鉄道を優先する (Fake の planner は好みの交通手段を先に選ぶ)
 * プロフィール画面が入ったら store から読む
 */
export const WAVE1_PREFERENCES = {
  homeStation: "東京",
  preferredTransport: "rail",
} as const satisfies TravelerPreferences;
