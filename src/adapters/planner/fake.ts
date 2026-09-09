import type { PlannerPort } from "@/domain/planner";
import { err } from "@/lib/result";

/**
 * LLM を使わない決定的な planner
 *
 * `interpretEvent` はタイトルか場所で最初に見つかった既知の目的地と、予定の日付を取る
 * `choosePlan` は最初の往路と復路の候補を取り、滞在が 1 泊以上なら最初の宿泊を取る
 */
export const createFakePlanner = (): PlannerPort => {
  return {
    interpretEvent: async () => err({ kind: "notATrip", reason: "" }),
    choosePlan: async () => err({ kind: "noViableChoice", reason: "" }),
  };
};
