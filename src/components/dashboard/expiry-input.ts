import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type { SetUpMandateBody } from "@/lib/secretary-request";

const DAY_MS = 24 * 60 * 60 * 1000;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 画面の表示が Asia/Tokyo 固定なので、入力も JST として読む
const JST_OFFSET = "+09:00";

// 期限の既定値は、支払い枠を作った日から 1 か月ほど先にする
const DEFAULT_EXPIRY_DAYS = 30;

const MINUTE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const SECOND_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * フォームの入力値 (input の文字列のまま)
 */
export type MandateFormValues = {
  cap: string;
  expiresAt: string;
  purpose: string;
};

/**
 * フォームの入力で最初に見つかった不備
 */
export type MandateFormError = {
  field: "cap" | "expiresAt" | "purpose";
};

/**
 * 期限の既定値 (`now` の 30 日後を JST の `YYYY-MM-DDTHH:mm` で)
 *
 * `<input type="datetime-local">` の value の形
 */
export const defaultExpiryInput = (now: string): string => {
  const at = Date.parse(now) + DEFAULT_EXPIRY_DAYS * DAY_MS + JST_OFFSET_MS;

  return new Date(at).toISOString().slice(0, 16);
};

/**
 * datetime-local の値をオフセット付きの ISO 8601 にする
 *
 * 画面の表示が `Asia/Tokyo` 固定なので入力も JST として読み、`+09:00` を付ける
 * `YYYY-MM-DDTHH:mm` か `YYYY-MM-DDTHH:mm:ss` 以外は undefined
 */
export const isoDateTimeFromLocalInput = (
  value: string,
): string | undefined => {
  if (MINUTE_INPUT_PATTERN.test(value)) {
    return `${value}:00${JST_OFFSET}`;
  }

  if (SECOND_INPUT_PATTERN.test(value)) {
    return `${value}${JST_OFFSET}`;
  }

  return undefined;
};

/**
 * 入力値を body にする
 *
 * cap は 1 以上の safe integer、期限は `now` より後、用途は空白を除いて空でないこと
 * 値の検査はサーバ (003 の `inputs.ts`) でもするので、ここは項目ごとの案内を出すためだけ
 */
export const buildSetUpMandateBody = (
  values: MandateFormValues,
  now: string,
): Result<SetUpMandateBody, MandateFormError> => {
  const cap = Number(values.cap);

  if (!Number.isSafeInteger(cap) || cap < 1) {
    return err({ field: "cap" });
  }

  const expiresAt = isoDateTimeFromLocalInput(values.expiresAt);

  if (expiresAt === undefined || Date.parse(expiresAt) <= Date.parse(now)) {
    return err({ field: "expiresAt" });
  }

  const purpose = values.purpose.trim();

  if (purpose === "") {
    return err({ field: "purpose" });
  }

  return ok({ cap, expiresAt, purpose });
};
