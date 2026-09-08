import type { ScanErrorKind, ScanResponse } from "@/lib/calendar-scan-response";
import {
  parseScanErrorKind,
  parseScanResponse,
} from "@/lib/calendar-scan-response";
import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";

const SCAN_PATH = "/api/calendar/scan";

const networkKind = (): ScanErrorKind => {
  return "network";
};

const schemaKind = (): ScanErrorKind => {
  return "schema";
};

/**
 * カレンダースキャンの Route Handler を呼び、応答をパースして返す
 *
 * ブラウザ側の境界なので、応答は unknown として受けてスキーマで確かめる
 */
export const requestScan = async (
  fetchFn: FetchLike,
): Promise<Result<ScanResponse, ScanErrorKind>> => {
  const response = await fromPromise(
    fetchFn(SCAN_PATH, { method: "POST" }),
    networkKind,
  );

  if (!response.ok) {
    return response;
  }

  const body = await fromPromise(response.value.json(), schemaKind);

  if (!body.ok) {
    return body;
  }

  if (!response.value.ok) {
    return err(parseScanErrorKind(body.value));
  }

  const parsed = parseScanResponse(body.value);

  if (!parsed.ok) {
    return err(schemaKind());
  }

  return ok(parsed.value);
};
