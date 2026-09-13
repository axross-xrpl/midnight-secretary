import type { SetUpMandateBody } from "@/lib/secretary-request";

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CAP = 200000;

const EXPIRY_DAYS = 30;

/**
 * Wave 1 で全ユーザに使う支払い枠の固定値
 *
 * 上限 200,000 (通貨は API の既定)、期限は now から 30 日後
 * 用途は画面のロケールの文言 (`Conversation.defaultPurpose`) を呼び出し側が渡す
 * ユーザが決めるフォームは Wave 2 以降
 */
export const defaultMandateDraft = (
  now: string,
  purpose: string,
): SetUpMandateBody => {
  return {
    cap: DEFAULT_CAP,
    expiresAt: new Date(Date.parse(now) + EXPIRY_DAYS * DAY_MS).toISOString(),
    purpose,
  };
};
