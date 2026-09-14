import "server-only";

import type { CalendarEventId, ParseError, TripId } from "@/domain/identifiers";
import {
  parseAmount,
  parseCalendarEventId,
  parseIsoDateTime,
  parseTripId,
} from "@/domain/identifiers.parse";
import type { Locale } from "@/domain/locale";
import type { MandateDraft } from "@/domain/mandate";
import type { Currency } from "@/domain/money";
import type { PaymentVisibilityInput } from "@/domain/trip";
import {
  approveTripBodySchema,
  proposeTripBodySchema,
  setUpMandateBodySchema,
  writeBackBodySchema,
} from "@/lib/secretary-request";
import type { Result } from "@/lib/result";
import { err, mapErr, ok } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import { fromZod } from "@/lib/schema";

/**
 * `proposeTrip` に渡す、brand 付きの入力
 */
export type ProposeTripRequest = {
  eventId: CalendarEventId;
  locale: Locale;
};

/**
 * `writeBackTrip` に渡す、brand 付きの入力
 */
export type WriteBackRequest = {
  locale: Locale;
};

// Wave 1 の支払いはデモ用トークン 1 本なので、上限の通貨はクライアントに選ばせない
const CAP_CURRENCY: Currency = "MST";

// domain の parse の失敗を、境界の応答に載せられる形に写す
const schemaErrorOf = (error: ParseError): SchemaError => {
  return {
    kind: "schema",
    issues: [{ path: [error.field], message: "invalid" }],
  };
};

/**
 * `POST /api/secretary/mandate` の body を mandate の下書きにする
 */
export const parseSetUpMandateInput = (
  raw: unknown,
): Result<MandateDraft, SchemaError> => {
  const body = fromZod(setUpMandateBodySchema.safeParse(raw));

  if (!body.ok) {
    return body;
  }

  const cap = parseAmount(body.value.cap);

  if (!cap.ok) {
    return err(schemaErrorOf(cap.error));
  }

  const expiresAt = parseIsoDateTime(body.value.expiresAt);

  if (!expiresAt.ok) {
    return err(schemaErrorOf(expiresAt.error));
  }

  return ok({
    cap: { amount: cap.value, currency: CAP_CURRENCY },
    expiresAt: expiresAt.value,
    purpose: body.value.purpose,
  });
};

/**
 * `POST /api/secretary/trips` の body を提案の入力にする
 */
export const parseProposeTripInput = (
  raw: unknown,
): Result<ProposeTripRequest, SchemaError> => {
  const body = fromZod(proposeTripBodySchema.safeParse(raw));

  if (!body.ok) {
    return body;
  }

  const eventId = parseCalendarEventId(body.value.eventId);

  if (!eventId.ok) {
    return err(schemaErrorOf(eventId.error));
  }

  return ok({ eventId: eventId.value, locale: body.value.locale });
};

/**
 * `POST /api/secretary/trips/[tripId]/approve` の body を公開範囲の指定にする
 *
 * 計画に合わせるのは use case の仕事なので、ここは形だけを見る
 */
export const parseApproveTripInput = (
  raw: unknown,
): Result<PaymentVisibilityInput, SchemaError> => {
  const body = fromZod(approveTripBodySchema.safeParse(raw));

  if (!body.ok) {
    return body;
  }

  return ok(body.value.visibility);
};

/**
 * `POST /api/secretary/trips/[tripId]/write-back` の body を書き戻しの入力にする
 */
export const parseWriteBackInput = (
  raw: unknown,
): Result<WriteBackRequest, SchemaError> => {
  const body = fromZod(writeBackBodySchema.safeParse(raw));

  if (!body.ok) {
    return body;
  }

  return ok({ locale: body.value.locale });
};

/**
 * パスの `[tripId]` を TripId にする
 *
 * UUID でなければ schema の失敗 (path は `["tripId"]`)
 */
export const parseTripIdParam = (raw: string): Result<TripId, SchemaError> => {
  return mapErr(parseTripId(raw), schemaErrorOf);
};
