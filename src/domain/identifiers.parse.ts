import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type {
  Amount,
  CalendarEventId,
  IsoDate,
  IsoDateTime,
  MandateId,
  OfferId,
  ParseError,
  PaymentRef,
  TripId,
  UserId,
  WalletAddress,
} from "./identifiers";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (field: string, value: unknown): ParseError => {
  return { kind: "invalid", field, value };
};

// brand を付ける場所はスマートコンストラクタだけなので、キャストはこのファイルに置く
const nonEmpty = <T extends string>(
  field: string,
  raw: string,
): Result<T, ParseError> => {
  if (raw === "") {
    return err(invalid(field, raw));
  }

  return ok(raw as T);
};

// Date は溢れた日付を繰り上げる (2026-02-30 は 2026-03-02 になる) ので、往復変換で一致するかを見て弾く
const isCalendarDate = (raw: string): boolean => {
  const parsed = Date.parse(raw);

  if (Number.isNaN(parsed)) {
    return false;
  }

  return new Date(parsed).toISOString().slice(0, 10) === raw;
};

/**
 * 入力が正しいと分かっている parse の結果を取り出す
 *
 * ここで失敗するのは呼び出し側が自分の保証を破ったときで、期待される失敗ではなくバグ
 * 生成した id、parse 済みの値の演算、固定の seed データに使い、外部入力には決して使わない
 */
export const mustParse = <T>(parsed: Result<T, ParseError>): T => {
  if (!parsed.ok) {
    throw new Error(
      `bug: ${parsed.error.field} rejected ${JSON.stringify(parsed.error.value)}`,
    );
  }

  return parsed.value;
};

/**
 * Google アカウントの subject を UserId として parse する (空でない文字列)
 */
export const parseUserId = (raw: string): Result<UserId, ParseError> => {
  return nonEmpty("userId", raw);
};

/**
 * Google カレンダーの予定 id を parse する (空でない文字列)
 */
export const parseCalendarEventId = (
  raw: string,
): Result<CalendarEventId, ParseError> => {
  return nonEmpty("calendarEventId", raw);
};

/**
 * 出張 id を parse する (UUID 文字列)
 */
export const parseTripId = (raw: string): Result<TripId, ParseError> => {
  if (!UUID_PATTERN.test(raw)) {
    return err(invalid("tripId", raw));
  }

  return ok(raw as TripId);
};

/**
 * 料金表の候補 id を parse する (空でない文字列)
 */
export const parseOfferId = (raw: string): Result<OfferId, ParseError> => {
  return nonEmpty("offerId", raw);
};

/**
 * mandate id を parse する (空でない文字列)
 */
export const parseMandateId = (raw: string): Result<MandateId, ParseError> => {
  return nonEmpty("mandateId", raw);
};

/**
 * 支払い参照を parse する (空でない文字列)
 */
export const parsePaymentRef = (
  raw: string,
): Result<PaymentRef, ParseError> => {
  return nonEmpty("paymentRef", raw);
};

/**
 * Midnight のアドレスを parse する (空でない文字列)
 *
 * 形式の検査は Midnight adapter が入る時点で adapter に合わせて強める
 */
export const parseWalletAddress = (
  raw: string,
): Result<WalletAddress, ParseError> => {
  return nonEmpty("walletAddress", raw);
};

/**
 * ISO 8601 の日時文字列を parse する
 *
 * Date が解釈できない値と、時刻を持たない日付は弾く
 */
export const parseIsoDateTime = (
  raw: string,
): Result<IsoDateTime, ParseError> => {
  if (Number.isNaN(Date.parse(raw)) || !raw.includes("T")) {
    return err(invalid("isoDateTime", raw));
  }

  return ok(raw as IsoDateTime);
};

/**
 * ISO 8601 の暦日 (YYYY-MM-DD) を parse する
 *
 * 存在しない日は弾く
 */
export const parseIsoDate = (raw: string): Result<IsoDate, ParseError> => {
  if (!ISO_DATE_PATTERN.test(raw) || !isCalendarDate(raw)) {
    return err(invalid("isoDate", raw));
  }

  return ok(raw as IsoDate);
};

/**
 * 通貨の最小単位で表した非負整数の金額を parse する
 */
export const parseAmount = (raw: number): Result<Amount, ParseError> => {
  if (!Number.isSafeInteger(raw) || raw < 0) {
    return err(invalid("amount", raw));
  }

  return ok(raw as Amount);
};
