import type { DateTimeFormatOptions } from "next-intl";
import { match } from "ts-pattern";
import type {
  LodgingOfferResponse,
  MandateResponse,
  MoneyResponse,
  PlaceOfferResponse,
  TransportOfferResponse,
  TripPlanResponse,
} from "@/lib/secretary-response";
import type { VisibilityCategory } from "./flow";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 年齢制限つきの候補が下限を持たないときの既定 (domain の `adultRequirementOf` と同じ)
 */
export const DEFAULT_AGE_LIMIT = 20;

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
 *
 * `category` は公開範囲の候補と同じ名前で、往路と復路を見分けるのにも使う
 */
export type PlanRow =
  | {
      kind: "transport";
      category: "outbound" | "inbound";
      offer: TransportOfferResponse;
    }
  | { kind: "lodging"; category: "lodging"; offer: LodgingOfferResponse }
  | { kind: "dining"; category: "dining"; offer: PlaceOfferResponse }
  | { kind: "leisure"; category: "leisure"; offer: PlaceOfferResponse };

const lodgingRowOf = (
  lodging: LodgingOfferResponse | undefined,
): readonly PlanRow[] => {
  if (lodging === undefined) {
    return [];
  }

  return [{ kind: "lodging", category: "lodging", offer: lodging }];
};

const diningRowOf = (
  dining: PlaceOfferResponse | undefined,
): readonly PlanRow[] => {
  if (dining === undefined) {
    return [];
  }

  return [{ kind: "dining", category: "dining", offer: dining }];
};

const leisureRowOf = (
  leisure: PlaceOfferResponse | undefined,
): readonly PlanRow[] => {
  if (leisure === undefined) {
    return [];
  }

  return [{ kind: "leisure", category: "leisure", offer: leisure }];
};

/**
 * 計画を時系列の行にする (往路、宿泊があれば宿泊、飲食があれば飲食、レジャーがあればレジャー、復路)
 *
 * 支払いの順 (往路、復路、宿泊、飲食、レジャー) とは違う
 */
export const planRows = (plan: TripPlanResponse): readonly PlanRow[] => {
  return [
    { kind: "transport", category: "outbound", offer: plan.outbound },
    ...lodgingRowOf(plan.lodging),
    ...diningRowOf(plan.dining),
    ...leisureRowOf(plan.leisure),
    { kind: "transport", category: "inbound", offer: plan.inbound },
  ];
};

/**
 * 組み直した提案が前の提案からどこが変わったか
 *
 * `rows` は候補が変わった行の category で、`planRows` と同じ順 (前の提案に無かった行を含む。前にあって無くなった行は新しい提案に出ないので持たない)
 * `total` は合計が変わったか
 */
export type PlanDiff = {
  rows: readonly VisibilityCategory[];
  total: boolean;
};

// 計画の同じ category の候補の id (候補が無ければ undefined)
const offerIdOf = (
  plan: TripPlanResponse,
  category: VisibilityCategory,
): string | undefined => {
  return match(category)
    .with("outbound", () => plan.outbound.id)
    .with("inbound", () => plan.inbound.id)
    .with("lodging", () => plan.lodging?.id)
    .with("dining", () => plan.dining?.id)
    .with("leisure", () => plan.leisure?.id)
    .exhaustive();
};

/**
 * 前の提案と新しい提案を行ごとに比べる
 *
 * 行は同じ category の候補の `id` で比べる (id が同じなら同じ候補とみなし、金額は比べない)
 * 合計は `amount` で比べる
 */
export const diffPlans = (
  previous: TripPlanResponse,
  plan: TripPlanResponse,
): PlanDiff => {
  const isChangedRow = (row: PlanRow): boolean => {
    return offerIdOf(previous, row.category) !== row.offer.id;
  };

  return {
    rows: planRows(plan)
      .filter(isChangedRow)
      .map((row) => row.category),
    total: previous.total.amount !== plan.total.amount,
  };
};

/**
 * 計画が成人であることを要する候補と年齢の下限 (クライアントの型)
 */
export type AdultRequirementResponse = {
  offer: PlaceOfferResponse;
  ageLimit: number;
};

/**
 * 計画が成人であることを要する候補を含むなら、その候補と年齢の下限
 *
 * domain の `adultRequirementOf` と同じ導出で、クライアントは brand を持たないので手元に置く
 * `requiredVerifications` に `age` を含む `dining` が対象で、`ageLimit` が無ければ 20
 */
export const adultRequirementOfResponse = (
  plan: TripPlanResponse,
): AdultRequirementResponse | undefined => {
  const dining = plan.dining;

  if (dining === undefined || !dining.requiredVerifications.includes("age")) {
    return undefined;
  }

  return { offer: dining, ageLimit: dining.ageLimit ?? DEFAULT_AGE_LIMIT };
};

/**
 * 年齢確認の基準日 (cutoff の `ageLimit` 年後の同じ月日)
 *
 * cutoff は基準日 (出発日) の `ageLimit` 年前なので、戻すと基準日になる
 * 基準日が 2 月 29 日のときだけ cutoff が 2 月 28 日に寄っているので、戻した日も 2 月 28 日になる
 * 文言の「{date} 時点で」に出すのは cutoff ではなくこちら
 */
export const asOfDateOf = (cutoffDate: string, ageLimit: number): string => {
  const year = Number(cutoffDate.slice(0, 4)) + ageLimit;

  return `${String(year).padStart(4, "0")}-${cutoffDate.slice(5)}`;
};
