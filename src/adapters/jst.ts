import type { IsoDate, IsoDateTime } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";

// Wave 1 の旅行は国内だけなので、fake は固定のオフセットで現地時刻を読み書きする
const JST_OFFSET = "+09:00";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 正しい時点から組み立てた日付は正しいので、ここでのパース失敗はバグ
const dateOfMs = (ms: number): IsoDate => {
  return mustParse(parseIsoDate(new Date(ms).toISOString().slice(0, 10)));
};

/**
 * ある時点が JST で属する日付
 */
export const jstDateOf = (dateTime: IsoDateTime): IsoDate => {
  return dateOfMs(Date.parse(dateTime) + JST_OFFSET_MS);
};

/**
 * ある日付の JST の現地時刻に当たる時点
 *
 * `time` は `HH:mm`
 */
export const jstDateTimeOf = (date: IsoDate, time: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(`${date}T${time}:00${JST_OFFSET}`));
};
