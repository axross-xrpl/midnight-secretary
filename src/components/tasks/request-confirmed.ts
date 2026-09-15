import { z } from "zod";
import type { RequestFailure } from "@/components/chat/types";
import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";
import { parseSecretaryFailure } from "@/lib/secretary-response";

const CONFIRMED_TRIPS_PATH = "/api/secretary/confirmed-trips";

// 消した id だけが返るので、封筒の形だけを確かめる
const deletedEnvelopeSchema = z.object({ data: z.object({ id: z.string() }) });

const networkFailure = (): RequestFailure => {
  return { code: "network" };
};

const schemaFailure = (): RequestFailure => {
  return { code: "schema" };
};

/**
 * `DELETE /api/secretary/confirmed-trips/[tripId]`
 *
 * 確定旅程を 1 件消す (body は無い)
 * 応答は `request-secretary.ts` と同じ順序で、JSON を読んでから status を見る
 * 消した id は使わないので、成功は値を持たない
 */
export const requestDeleteConfirmedTrip = async (
  fetchFn: FetchLike,
  tripId: string,
): Promise<Result<void, RequestFailure>> => {
  const path = `${CONFIRMED_TRIPS_PATH}/${encodeURIComponent(tripId)}`;
  const response = await fromPromise(
    fetchFn(path, { method: "DELETE" }),
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

  if (!deletedEnvelopeSchema.safeParse(payload.value).success) {
    return err(schemaFailure());
  }

  return ok(undefined);
};
