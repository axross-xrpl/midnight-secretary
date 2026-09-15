import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type {
  ApproveTripBody,
  ProposeTripBody,
  ReplanBody,
  SetUpMandateBody,
  WriteBackBody,
} from "@/lib/secretary-request";
import type { MandateResponse, TripResponse } from "@/lib/secretary-response";
import {
  parseMandateResponse,
  parseSecretaryFailure,
  parseTripResponse,
} from "@/lib/secretary-response";
import type { RequestFailure } from "./types";

const MANDATE_PATH = "/api/secretary/mandate";

const TRIPS_PATH = "/api/secretary/trips";

// 応答のスキーマは secretary-response.ts の parse 関数をそのまま使うので、この形の関数を渡すだけにする
type ParsePayload<T> = (payload: unknown) => Result<T, SchemaError>;

const networkFailure = (): RequestFailure => {
  return { code: "network" };
};

const schemaFailure = (): RequestFailure => {
  return { code: "schema" };
};

const tripPath = (tripId: string, action: string): string => {
  return `${TRIPS_PATH}/${encodeURIComponent(tripId)}/${action}`;
};

// body が無い操作 (支払い) には content-type を付けない
const initFor = (body: unknown): RequestInit => {
  if (body === undefined) {
    return { method: "POST" };
  }

  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
};

// ブラウザ側の境界なので、応答は unknown として受けてスキーマで確かめる
// JSON を読んでから status を見るのは request-scan.ts と同じ順序
const postJson = async <T>(
  fetchFn: FetchLike,
  path: string,
  body: unknown,
  parse: ParsePayload<T>,
): Promise<Result<T, RequestFailure>> => {
  const response = await fromPromise(
    fetchFn(path, initFor(body)),
    networkFailure,
  );

  if (!response.ok) {
    return response;
  }

  const payload = await fromPromise(response.value.json(), schemaFailure);

  if (!payload.ok) {
    return payload;
  }

  if (!response.value.ok) {
    return err(parseSecretaryFailure(payload.value));
  }

  const parsed = parse(payload.value);

  if (!parsed.ok) {
    return err(schemaFailure());
  }

  return ok(parsed.value);
};

/**
 * `POST /api/secretary/mandate`
 */
export const requestSetUpMandate = (
  fetchFn: FetchLike,
  body: SetUpMandateBody,
): Promise<Result<MandateResponse, RequestFailure>> => {
  return postJson(fetchFn, MANDATE_PATH, body, parseMandateResponse);
};

/**
 * `POST /api/secretary/trips`
 *
 * 同じ予定に proposed の trip があれば置き換わる (提案し直し)
 */
export const requestProposeTrip = (
  fetchFn: FetchLike,
  body: ProposeTripBody,
): Promise<Result<TripResponse, RequestFailure>> => {
  return postJson(fetchFn, TRIPS_PATH, body, parseTripResponse);
};

/**
 * `POST /api/secretary/trips/[tripId]/approve`
 *
 * `body.visibility` は候補ごとの公開範囲で、指定の無い候補は公開になる
 * 年齢確認が通らなければ承認済みではなく、`failedAgeCheck` を付けた提案済みの trip が返る
 */
export const requestApproveTrip = (
  fetchFn: FetchLike,
  tripId: string,
  body: ApproveTripBody,
): Promise<Result<TripResponse, RequestFailure>> => {
  return postJson(
    fetchFn,
    tripPath(tripId, "approve"),
    body,
    parseTripResponse,
  );
};

/**
 * `POST /api/secretary/trips/[tripId]/replan`
 *
 * 年齢確認が通らなかった提案を年齢制限のない候補で組み直し、`revision` つきの提案が返る
 */
export const requestReplanTrip = (
  fetchFn: FetchLike,
  tripId: string,
  body: ReplanBody,
): Promise<Result<TripResponse, RequestFailure>> => {
  return postJson(fetchFn, tripPath(tripId, "replan"), body, parseTripResponse);
};

/**
 * `POST /api/secretary/trips/[tripId]/pay`
 */
export const requestPayForTrip = (
  fetchFn: FetchLike,
  tripId: string,
): Promise<Result<TripResponse, RequestFailure>> => {
  return postJson(
    fetchFn,
    tripPath(tripId, "pay"),
    undefined,
    parseTripResponse,
  );
};

/**
 * `POST /api/secretary/trips/[tripId]/write-back`
 */
export const requestWriteBackTrip = (
  fetchFn: FetchLike,
  tripId: string,
  body: WriteBackBody,
): Promise<Result<TripResponse, RequestFailure>> => {
  return postJson(
    fetchFn,
    tripPath(tripId, "write-back"),
    body,
    parseTripResponse,
  );
};
