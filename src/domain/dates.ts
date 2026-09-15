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

// 年は 4 桁に揃える (IsoDate の年は 4 桁)
const isoDateOf = (year: number, monthDay: string): string => {
  return `${String(year).padStart(4, "0")}-${monthDay}`;
};

/**
 * `date` の `years` 年前の同じ月日 (2 月 29 日は 2 月 28 日にする)
 *
 * 年齢確認の cutoff に使う (出発日の 20 年前以前に生まれていれば 20 歳以上)
 */
export const yearsBefore = (date: IsoDate, years: number): IsoDate => {
  const year = Number(date.slice(0, 4)) - years;
  const sameMonthDay = parseIsoDate(isoDateOf(year, date.slice(5)));

  if (sameMonthDay.ok) {
    return sameMonthDay.value;
  }

  // 年を変えて存在しなくなる月日は 2 月 29 日だけなので、その年の 2 月 28 日にする
  return mustParse(parseIsoDate(isoDateOf(year, "02-28")));
};
