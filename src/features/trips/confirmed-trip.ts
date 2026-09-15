import type { ServiceCategory } from "@/features/services/constants";

/**
 * 明細 1 件が取りうる状態 (`trip_items.status` の CHECK と同じ値)
 */
export const confirmedTripItemStatuses = [
  "selected",
  "paid",
  "booked",
  "cancelled",
] as const;

export type ConfirmedTripItemStatus =
  (typeof confirmedTripItemStatuses)[number];

/**
 * 確定旅程の明細 1 件 (`trip_items` の 1 行)
 *
 * 名称・単価・送金先は確定した時点のスナップショットなので、
 * サービス行を引かなくても表示が成り立つ (`db-design.md` §6.3)
 */
export type ConfirmedTripItem = {
  id: string;
  seq: number;
  category: ServiceCategory;
  name: string;
  unitPriceJpyc: number;
  quantity: number;
  priceJpyc: number;
  startAt: string | null;
  endAt: string | null;
  status: ConfirmedTripItemStatus;
  bookingRef: string | null;
};

/**
 * 確定した旅程 1 件 (`trips` の 1 行と、その明細)
 *
 * `endDate` が無いものは日帰り、`endDate > startDate` なら宿泊を伴う
 */
export type ConfirmedTrip = {
  id: string;
  title: string;
  originCity: string;
  destinationCity: string;
  startDate: string;
  endDate: string | null;
  items: readonly ConfirmedTripItem[];
};

/**
 * 旅程の合計金額
 *
 * `trips` は合計の列を持たず明細から導出する (`db-design.md` §6.2) ので、
 * 一覧の合計もここで計算する
 * 取り消した明細は合計に数えない
 */
export const totalJpycOf = (items: readonly ConfirmedTripItem[]): number => {
  return items
    .filter((item) => item.status !== "cancelled")
    .reduce((total, item) => total + item.priceJpyc, 0);
};
