import { z } from "zod";
import type { Result } from "./result";
import type { SchemaError } from "./schema";
import { fromZod } from "./schema";

/**
 * 予定の開始または終了
 *
 * 終日の予定は日付だけを持ち、時刻ありの予定は ISO 8601 の日時を持つ
 */
export const scanEventTimeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allDay"), date: z.string() }),
  z.object({ kind: z.literal("timed"), dateTime: z.string() }),
]);

/**
 * スキャンで読み取った予定 1 件
 */
export const scanEventSchema = z.object({
  id: z.string(),
  summary: z.string(),
  location: z.string().optional(),
  start: scanEventTimeSchema,
  end: scanEventTimeSchema,
});

/**
 * カレンダースキャンの応答
 */
export const scanResponseSchema = z.object({
  events: z.array(scanEventSchema),
});

/**
 * カレンダースキャンが失敗した理由
 */
export const scanErrorKindSchema = z.enum([
  "unauthenticated",
  "refreshFailed",
  "forbidden",
  "http",
  "network",
  "schema",
]);

/**
 * カレンダースキャンの失敗応答
 */
export const scanErrorResponseSchema = z.object({
  error: z.object({ kind: scanErrorKindSchema }),
});

/**
 * 予定の開始または終了
 */
export type ScanEventTime = z.infer<typeof scanEventTimeSchema>;

/**
 * スキャンで読み取った予定 1 件
 */
export type ScanEvent = z.infer<typeof scanEventSchema>;

/**
 * カレンダースキャンの応答
 */
export type ScanResponse = z.infer<typeof scanResponseSchema>;

/**
 * カレンダースキャンが失敗した理由
 */
export type ScanErrorKind = z.infer<typeof scanErrorKindSchema>;

/**
 * Route Handler の応答 JSON をスキャン結果としてパースする
 */
export const parseScanResponse = (
  payload: unknown,
): Result<ScanResponse, SchemaError> => {
  return fromZod(scanResponseSchema.safeParse(payload));
};

/**
 * Route Handler の失敗応答 JSON から失敗の理由を取り出す
 *
 * 形が合わない応答は schema として扱う
 */
export const parseScanErrorKind = (payload: unknown): ScanErrorKind => {
  const parsed = scanErrorResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return "schema";
  }

  return parsed.data.error.kind;
};
