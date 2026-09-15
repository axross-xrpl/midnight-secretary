import { z } from "zod";
import type { Locale } from "@/domain/locale";
import { routing } from "@/i18n/routing";

// 画面が送る locale が domain の Locale と同じ集合であることを、この注釈で tsc に確かめさせる
const LOCALES: readonly Locale[] = routing.locales;

/**
 * 画面が送る locale
 *
 * `routing.locales` と同じ集合で、domain の `Locale` と一致する
 */
export const localeSchema = z.enum(LOCALES);

/**
 * `POST /api/secretary/mandate` の body
 *
 * 通貨は Wave 1 のデモ用トークンに固定するのでクライアントからは受け取らない
 */
export const setUpMandateBodySchema = z
  .object({
    cap: z.number(),
    expiresAt: z.string(),
    purpose: z.string().min(1),
  })
  .strict();

/**
 * `POST /api/secretary/trips` の body
 */
export const proposeTripBodySchema = z
  .object({ eventId: z.string(), locale: localeSchema })
  .strict();

/**
 * 支払い 1 件の公開範囲
 *
 * domain の `SettlementVisibility` と同じ集合
 */
export const visibilitySchema = z.enum(["public", "private"]);

/**
 * `POST /api/secretary/trips/[tripId]/approve` の body
 *
 * 画面は必ず `visibility` を送るので、body が無いことも空のことも許さない
 * 計画に無い候補 (日帰りの宿) の指定は use case が捨てるので、ここでは形だけを見る
 */
export const approveTripBodySchema = z
  .object({
    visibility: z
      .object({
        outbound: visibilitySchema.optional(),
        inbound: visibilitySchema.optional(),
        lodging: visibilitySchema.optional(),
        dining: visibilitySchema.optional(),
        leisure: visibilitySchema.optional(),
      })
      .strict(),
  })
  .strict();

/**
 * `POST /api/secretary/trips/[tripId]/replan` の body
 *
 * `locale` は planner の呼び直しに要る
 */
export const replanBodySchema = z.object({ locale: localeSchema }).strict();

/**
 * `POST /api/secretary/trips/[tripId]/write-back` の body
 */
export const writeBackBodySchema = z.object({ locale: localeSchema }).strict();

/**
 * `POST /api/secretary/mandate` の body
 */
export type SetUpMandateBody = z.infer<typeof setUpMandateBodySchema>;

/**
 * `POST /api/secretary/trips` の body
 */
export type ProposeTripBody = z.infer<typeof proposeTripBodySchema>;

/**
 * `POST /api/secretary/trips/[tripId]/approve` の body
 */
export type ApproveTripBody = z.infer<typeof approveTripBodySchema>;

/**
 * `POST /api/secretary/trips/[tripId]/replan` の body
 */
export type ReplanBody = z.infer<typeof replanBodySchema>;

/**
 * `POST /api/secretary/trips/[tripId]/write-back` の body
 */
export type WriteBackBody = z.infer<typeof writeBackBodySchema>;
