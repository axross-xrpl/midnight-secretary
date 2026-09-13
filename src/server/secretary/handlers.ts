import "server-only";

import type { NextRequest } from "next/server";
import type { SecretaryContext, SessionError } from "@/adapters/auth/session";
import { WAVE1_PREFERENCES } from "@/application/preferences";
import {
  approveTrip,
  payForTrip,
  proposeTrip,
  setUpMandate,
  writeBackTrip,
} from "@/application/secretary";
import type { Locale } from "@/domain/locale";
import {
  invalidRequestResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import type { Result } from "@/lib/result";
import { fromPromise } from "@/lib/result";
import type { SchemaIssue } from "@/lib/schema";
import {
  parseProposeTripInput,
  parseSetUpMandateInput,
  parseTripIdParam,
  parseWriteBackInput,
} from "./inputs";
import { dataResponse, secretaryErrorResponse } from "./responses";
import type { WriteBackTranslate } from "./write-back-text";
import { writeBackText } from "./write-back-text";

/**
 * リクエストからサインイン済みユーザの文脈を解決する
 *
 * 本番は `secretaryContextFor`、テストは Fake の deps を返す Stub
 */
export type ResolveContext = (
  request: NextRequest,
) => Promise<Result<SecretaryContext, SessionError>>;

/**
 * locale に対応する `WriteBack` 名前空間の翻訳関数を得る
 *
 * 本番は next-intl の翻訳関数、テストは Stub
 */
export type LoadWriteBackTranslate = (
  locale: Locale,
) => Promise<WriteBackTranslate>;

/**
 * Route Handler の本体が外から受け取るもの
 */
export type SecretaryHandlerDeps = {
  resolveContext: ResolveContext;
  loadTranslate: LoadWriteBackTranslate;
};

// JSON として読めない body は形の検査に入れないので、ここで 1 件の issue にする
const INVALID_JSON_ISSUES: readonly SchemaIssue[] = [
  { path: [], message: "invalid JSON" },
];

const readJsonBody = async (
  request: Request,
): Promise<Result<unknown, readonly SchemaIssue[]>> => {
  return fromPromise(request.json(), () => INVALID_JSON_ISSUES);
};

/**
 * mandate を作ってユーザにリンクする
 */
export const handleSetUpMandate = async (
  request: NextRequest,
  deps: SecretaryHandlerDeps,
): Promise<Response> => {
  const context = await deps.resolveContext(request);

  if (!context.ok) {
    return unauthorizedResponse();
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return invalidRequestResponse(body.error);
  }

  const draft = parseSetUpMandateInput(body.value);

  if (!draft.ok) {
    return invalidRequestResponse(draft.error.issues);
  }

  const created = await setUpMandate(
    context.value.userId,
    draft.value,
    context.value.now,
    context.value.deps,
  );

  if (!created.ok) {
    return secretaryErrorResponse(created.error);
  }

  return dataResponse(created.value, 201);
};

/**
 * 予定 1 件に対して出張を提案する
 */
export const handleProposeTrip = async (
  request: NextRequest,
  deps: SecretaryHandlerDeps,
): Promise<Response> => {
  const context = await deps.resolveContext(request);

  if (!context.ok) {
    return unauthorizedResponse();
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return invalidRequestResponse(body.error);
  }

  const input = parseProposeTripInput(body.value);

  if (!input.ok) {
    return invalidRequestResponse(input.error.issues);
  }

  const proposed = await proposeTrip(
    {
      userId: context.value.userId,
      eventId: input.value.eventId,
      locale: input.value.locale,
      preferences: WAVE1_PREFERENCES,
      now: context.value.now,
    },
    context.value.deps,
  );

  if (!proposed.ok) {
    return secretaryErrorResponse(proposed.error);
  }

  return dataResponse(proposed.value, 201);
};

/**
 * 提案済みの出張を承認する
 */
export const handleApproveTrip = async (
  request: NextRequest,
  tripId: string,
  deps: SecretaryHandlerDeps,
): Promise<Response> => {
  const context = await deps.resolveContext(request);

  if (!context.ok) {
    return unauthorizedResponse();
  }

  const parsedTripId = parseTripIdParam(tripId);

  if (!parsedTripId.ok) {
    return invalidRequestResponse(parsedTripId.error.issues);
  }

  const approved = await approveTrip(
    context.value.userId,
    parsedTripId.value,
    context.value.now,
    context.value.deps,
  );

  if (!approved.ok) {
    return secretaryErrorResponse(approved.error);
  }

  return dataResponse(approved.value, 200);
};

/**
 * 承認済みの出張を mandate のもとで支払う
 */
export const handlePayForTrip = async (
  request: NextRequest,
  tripId: string,
  deps: SecretaryHandlerDeps,
): Promise<Response> => {
  const context = await deps.resolveContext(request);

  if (!context.ok) {
    return unauthorizedResponse();
  }

  const parsedTripId = parseTripIdParam(tripId);

  if (!parsedTripId.ok) {
    return invalidRequestResponse(parsedTripId.error.issues);
  }

  const paid = await payForTrip(
    context.value.userId,
    parsedTripId.value,
    context.value.now,
    context.value.deps,
  );

  if (!paid.ok) {
    return secretaryErrorResponse(paid.error);
  }

  return dataResponse(paid.value, 200);
};

/**
 * 支払い済みの出張をカレンダーに書き戻す
 */
export const handleWriteBackTrip = async (
  request: NextRequest,
  tripId: string,
  deps: SecretaryHandlerDeps,
): Promise<Response> => {
  const context = await deps.resolveContext(request);

  if (!context.ok) {
    return unauthorizedResponse();
  }

  const parsedTripId = parseTripIdParam(tripId);

  if (!parsedTripId.ok) {
    return invalidRequestResponse(parsedTripId.error.issues);
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return invalidRequestResponse(body.error);
  }

  const input = parseWriteBackInput(body.value);

  if (!input.ok) {
    return invalidRequestResponse(input.error.issues);
  }

  const t = await deps.loadTranslate(input.value.locale);
  const written = await writeBackTrip(
    {
      userId: context.value.userId,
      tripId: parsedTripId.value,
      renderText: (trip) => writeBackText(trip, t),
      now: context.value.now,
    },
    context.value.deps,
  );

  if (!written.ok) {
    return secretaryErrorResponse(written.error);
  }

  return dataResponse(written.value, 200);
};
