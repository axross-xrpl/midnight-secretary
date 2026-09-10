import type { TripStatus } from "@/domain/trip";
import type {
  LodgingOfferResponse,
  MandateResponse,
  MoneyResponse,
  TransportOfferResponse,
  TripPlanResponse,
} from "@/lib/secretary-response";
import { accentPillClass, okPillClass, publicPillClass } from "./styles";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 整数を桁区切りにする関数
 *
 * next-intl の `useFormatter().number` を包んで渡す
 */
export type FormatNumber = (amount: number) => string;

/**
 * 金額を「整数 通貨コード」で出す (例: `150,000 DEMO`)
 *
 * 円記号は使わない (Wave 1 の通貨は demo トークン)
 */
export const moneyText = (
  money: MoneyResponse,
  formatNumber: FormatNumber,
): string => {
  return `${formatNumber(money.amount)} ${money.currency}`;
};

/**
 * 上限から使用済みを引いた残り
 */
export const remainingOf = (mandate: MandateResponse): MoneyResponse => {
  return {
    amount: mandate.cap.amount - mandate.spent.amount,
    currency: mandate.cap.currency,
  };
};

/**
 * 使用済みの割合 (0 から 100 の整数)
 *
 * 上限が 0 なら 0
 */
export const usedPercent = (mandate: MandateResponse): number => {
  if (mandate.cap.amount === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((mandate.spent.amount / mandate.cap.amount) * 100),
  );
};

/**
 * ハッシュを先頭と末尾だけ残して縮める
 */
export const shortHash = (hash: string, head = 10, tail = 6): string => {
  if (hash.length <= head + tail + 3) {
    return hash;
  }

  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
};

/**
 * チェックインからチェックアウトまでの泊数
 *
 * 引数は `YYYY-MM-DD`
 * domain の `nightsBetween` と同じ計算だが、クライアントは brand を持たないので手元に置く
 */
export const nightsOf = (checkIn: string, checkOut: string): number => {
  return Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / DAY_MS);
};

/**
 * 終日の予定の最終日 (排他の終了日の前日)
 *
 * 終了日が開始日と同じか前なら開始日
 */
export const inclusiveEndDate = (
  startDate: string,
  endDate: string,
): string => {
  if (Date.parse(endDate) <= Date.parse(startDate)) {
    return startDate;
  }

  return new Date(Date.parse(endDate) - DAY_MS).toISOString().slice(0, 10);
};

/**
 * 計画の 1 行
 */
export type PlanRow =
  | { kind: "transport"; offer: TransportOfferResponse }
  | { kind: "lodging"; offer: LodgingOfferResponse };

/**
 * 計画を時系列の行にする (往路、宿泊があれば宿泊、復路)
 *
 * 支払いの順 (往路、復路、宿泊) とは違う
 */
export const planRows = (plan: TripPlanResponse): readonly PlanRow[] => {
  if (plan.lodging === undefined) {
    return [
      { kind: "transport", offer: plan.outbound },
      { kind: "transport", offer: plan.inbound },
    ];
  }

  return [
    { kind: "transport", offer: plan.outbound },
    { kind: "lodging", offer: plan.lodging },
    { kind: "transport", offer: plan.inbound },
  ];
};

/**
 * 出張の状態を示すバッジ (支払い済みは公開台帳に載った印)
 */
export const statusPillClass = {
  proposed: accentPillClass,
  approved: accentPillClass,
  paid: publicPillClass,
  written: okPillClass,
} as const satisfies Record<TripStatus, string>;
