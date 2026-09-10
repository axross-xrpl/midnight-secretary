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
 * `POST /api/secretary/trips/[tripId]/write-back` の body
 */
export type WriteBackBody = z.infer<typeof writeBackBodySchema>;
