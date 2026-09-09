import type { Brand } from "@/lib/brand";

/**
 * Google アカウントの subject (`sub` クレーム)
 *
 * サインイン中のユーザを識別する
 */
export type UserId = Brand<string, "UserId">;

/**
 * Google カレンダーの予定 id
 */
export type CalendarEventId = Brand<string, "CalendarEventId">;

/**
 * 秘書が扱う出張の id
 *
 * 1 件のカレンダーの予定から作られる出張は多くても 1 件
 */
export type TripId = Brand<string, "TripId">;

/**
 * 料金表 (seed データ) にある候補の id
 */
export type OfferId = Brand<string, "OfferId">;

/**
 * mandate (支払いの委任) の id
 *
 * 公開台帳に載るので、個人から導出できてはならない
 */
export type MandateId = Brand<string, "MandateId">;

/**
 * mandate の中の支払い 1 件を識別する
 *
 * 出張 id と候補 id から導出するので、再試行した支払いは同じ参照を使い回す
 */
export type PaymentRef = Brand<string, "PaymentRef">;

/**
 * Midnight 上でトークンを受け取れるアドレス
 *
 * 事業者の受取先と、送金の記録に使う
 */
export type WalletAddress = Brand<string, "WalletAddress">;

/**
 * オフセット付きの ISO 8601 日時 (例: 2026-09-16T15:00:00Z)
 *
 * domain の値がサーバ境界を越えてもシリアライズできるように文字列のまま持つ
 */
export type IsoDateTime = Brand<string, "IsoDateTime">;

/**
 * タイムゾーンを持たない ISO 8601 の暦日 (YYYY-MM-DD)
 */
export type IsoDate = Brand<string, "IsoDate">;

/**
 * 通貨の最小単位で表した非負整数の金額
 */
export type Amount = Brand<number, "Amount">;

/**
 * このモジュールのスマートコンストラクタの失敗
 */
export type ParseError = {
  kind: "invalid";
  field: string;
  value: unknown;
};
