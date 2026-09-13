import { z } from "zod";

/**
 * 予定がいつ行われるか
 *
 * 終日の予定は日付だけを持ち、時刻ありの予定は ISO 8601 の日時を持つ
 * 終日の終了日は排他 (その日は含まない)
 */
export const scanEventTimeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("allDay"),
    startDate: z.string(),
    endDate: z.string(),
  }),

  z.object({ kind: z.literal("timed"), start: z.string(), end: z.string() }),
]);

/**
 * スキャンで読み取った予定 1 件
 */
export const scanEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  when: scanEventTimeSchema,
  location: z.string().optional(),
  description: z.string().optional(),
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
  "tokenExpired",
  "refreshFailed",
  "forbidden",
  "http",
  "network",
  "schema",
]);

/**
 * 予定がいつ行われるか
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
