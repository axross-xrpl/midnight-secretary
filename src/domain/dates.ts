import type { IsoDate } from "./identifiers";
import { mustParse, parseIsoDate } from "./identifiers.parse";

const DAY_MS = 24 * 60 * 60 * 1000;

// 日付だけの文字列は UTC の 0 時として読まれるので、暦日の演算にタイムゾーンは要らない
// 正しい時点から組み立てた日付は正しいので、ここでのパース失敗はバグ
const dateOfMs = (ms: number): IsoDate => {
  return mustParse(parseIsoDate(new Date(ms).toISOString().slice(0, 10)));
};

/**
 * `date` の `days` 日後の日付
 *
 * 負の数なら遡る
 */
export const addDays = (date: IsoDate, days: number): IsoDate => {
  return dateOfMs(Date.parse(date) + days * DAY_MS);
};

/**
 * `from` から `to` までの滞在が何泊か
 *
 * 両方が同じ日なら 0
 */
export const nightsBetween = (from: IsoDate, to: IsoDate): number => {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
};
