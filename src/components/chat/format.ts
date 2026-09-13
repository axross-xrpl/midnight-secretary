import type { DateTimeFormatOptions } from "next-intl";
import type {
  LodgingOfferResponse,
  MandateResponse,
  MoneyResponse,
  TransportOfferResponse,
  TripPlanResponse,
} from "@/lib/secretary-response";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 時刻付きの日時の書式 (日付は中、時刻は短)
 *
 * 吹き出しの時刻、承認日時、便の発着、時刻付きの予定に使う
 */
export const TIMED_OPTIONS = {
  dateStyle: "medium",
  timeStyle: "short",
} as const satisfies DateTimeFormatOptions;

/**
 * 日付だけの書式 (終日の予定と宿泊)
 *
 * 日付だけの文字列を時差で前日にずらさないよう UTC のまま出す
 */
export const DATE_OPTIONS = {
  dateStyle: "medium",
  timeZone: "UTC",
} as const satisfies DateTimeFormatOptions;

/**
 * 時刻付きの時点を日付だけで出す書式 (支払い枠の期限)
 *
 * `DATE_OPTIONS` と違い、見る人の時差で日付にする
 */
export const LOCAL_DATE_OPTIONS = {
  dateStyle: "medium",
} as const satisfies DateTimeFormatOptions;

/**
 * 整数を桁区切りにする関数
 *
 * next-intl の `useFormatter().number` を包んで渡す
 */
export type FormatNumber = (amount: number) => string;

/**
 * 金額を「整数 通貨コード」で出す (例: `150,000 MST`)
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

const HASH_HEAD = 10;

const HASH_TAIL = 6;

/**
 * ハッシュを先頭 10 文字と末尾 6 文字だけ残して縮める
 *
 * 縮めても短くならない長さならそのまま返す
 */
export const shortHash = (hash: string): string => {
  if (hash.length <= HASH_HEAD + HASH_TAIL + 3) {
    return hash;
  }

  return `${hash.slice(0, HASH_HEAD)}...${hash.slice(-HASH_TAIL)}`;
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
 * Intl が日時に入れる特殊な空白を通常の空白に揃える
 *
 * Node と Chrome は ICU の版が違い、範囲の区切りや AM / PM の前が U+2009 / U+202F になったり U+0020 になったりする
 * サーバとブラウザで文字列がずれると hydration が失敗するので、画面に出す日時はすべてここを通す
 */
export const plainSpaces = (text: string): string => {
  return text.replace(/[\u2009\u202F]/g, " ");
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
