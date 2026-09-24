import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";
import type { EscrowResponse, TripResponse } from "@/lib/secretary-response";
import {
  parseSecretaryFailure,
  parseTripResponse,
} from "@/lib/secretary-response";
import type { RequestFailure } from "./types";

const TRIPS_PATH = "/api/secretary/trips";

const networkFailure = (): RequestFailure => {
  return { code: "network" };
};

const schemaFailure = (): RequestFailure => {
  return { code: "schema" };
};

// 支払い参照はコロンを含むので、trip の id と同じくパスの 1 区切りとしてエンコードする
const confirmPath = (tripId: string, paymentRef: string): string => {
  return `${TRIPS_PATH}/${encodeURIComponent(tripId)}/payments/${encodeURIComponent(paymentRef)}/confirm`;
};

/**
 * `POST /api/secretary/trips/[tripId]/payments/[paymentRef]/confirm`
 *
 * body は無く、受取の確認で預かりを受取先へ解放した後の出張が返る
 * 失敗の封筒の扱いは request-secretary.ts と同じ (network / schema / サーバの封筒)
 */
export const requestConfirmReceipt = async (
  fetchFn: FetchLike,
  tripId: string,
  paymentRef: string,
): Promise<Result<TripResponse, RequestFailure>> => {
  const response = await fromPromise(
    fetchFn(confirmPath(tripId, paymentRef), { method: "POST" }),
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

  const parsed = parseTripResponse(payload.value);

  if (!parsed.ok) {
    return err(schemaFailure());
  }

  return ok(parsed.value);
};

/**
 * 応答の出張から、支払い参照 1 件の預かりの状態を引く
 *
 * 提案済みの出張には支払いが無く、知らない支払い参照でも undefined
 */
export const escrowOf = (
  trip: TripResponse,
  paymentRef: string,
): EscrowResponse | undefined => {
  if (trip.status === "proposed") {
    return undefined;
  }

  return trip.authorizations.find(
    (authorization) => authorization.paymentRef === paymentRef,
  )?.escrow;
};
