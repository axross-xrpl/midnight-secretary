import type { Result } from "@/lib/result";
import { err } from "@/lib/result";
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

/**
 * Google アカウントの subject を UserId として parse する (空でない文字列)
 */
export const parseUserId = (raw: string): Result<UserId, ParseError> => {
  return err({ kind: "invalid", field: "userId", value: raw });
};

/**
 * Google カレンダーの予定 id を parse する (空でない文字列)
 */
export const parseCalendarEventId = (
  raw: string,
): Result<CalendarEventId, ParseError> => {
  return err({ kind: "invalid", field: "calendarEventId", value: raw });
};

/**
 * 出張 id を parse する (UUID 文字列)
 */
export const parseTripId = (raw: string): Result<TripId, ParseError> => {
  return err({ kind: "invalid", field: "tripId", value: raw });
};

/**
 * 料金表の候補 id を parse する (空でない文字列)
 */
export const parseOfferId = (raw: string): Result<OfferId, ParseError> => {
  return err({ kind: "invalid", field: "offerId", value: raw });
};

/**
 * mandate id を parse する (空でない文字列)
 */
export const parseMandateId = (raw: string): Result<MandateId, ParseError> => {
  return err({ kind: "invalid", field: "mandateId", value: raw });
};

/**
 * 支払い参照を parse する (空でない文字列)
 */
export const parsePaymentRef = (
  raw: string,
): Result<PaymentRef, ParseError> => {
  return err({ kind: "invalid", field: "paymentRef", value: raw });
};

/**
 * Midnight のアドレスを parse する (空でない文字列)
 *
 * 形式の検査は Midnight adapter が入る時点で adapter に合わせて強める
 */
export const parseWalletAddress = (
  raw: string,
): Result<WalletAddress, ParseError> => {
  return err({ kind: "invalid", field: "walletAddress", value: raw });
};

/**
 * ISO 8601 の日時文字列を parse する
 *
 * Date が解釈できない値と、時刻を持たない日付は弾く
 */
export const parseIsoDateTime = (
  raw: string,
): Result<IsoDateTime, ParseError> => {
  return err({ kind: "invalid", field: "isoDateTime", value: raw });
};

/**
 * ISO 8601 の暦日 (YYYY-MM-DD) を parse する
 *
 * 存在しない日は弾く
 */
export const parseIsoDate = (raw: string): Result<IsoDate, ParseError> => {
  return err({ kind: "invalid", field: "isoDate", value: raw });
};

/**
 * 通貨の最小単位で表した非負整数の金額を parse する
 */
export const parseAmount = (raw: number): Result<Amount, ParseError> => {
  return err({ kind: "invalid", field: "amount", value: raw });
};
