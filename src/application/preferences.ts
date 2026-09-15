import type { TravelerPreferences } from "@/domain/plan";

/**
 * プロフィールに好みが無いときの既定値
 *
 * 出発地は Fake の料金表 (`seedCatalog`) の出発地と同じ東京
 * 参考シナリオが新幹線なので鉄道を優先する (Fake の planner は好みの交通手段を先に選ぶ)
 * 飲食とレジャーの好みは空で、planner は今までどおりの規則で選ぶ
 */
export const DEFAULT_PREFERENCES = {
  homeStation: "東京",
  preferredTransport: "rail",
  diningGenres: [],
  leisureGenres: [],
} as const satisfies TravelerPreferences;
