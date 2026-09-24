import "server-only";

import type { Result } from "@/lib/result";

type ReadError = { kind: "unavailable"; cause: unknown } | { kind: string };

/**
 * port の読み取りの失敗を例外に戻す
 *
 * 設定画面と、その Route Handler は読めなかったときの画面を持たず、今までどおり例外で
 * Next のエラー画面か `databaseReadErrorResponse` に届ける
 * `unavailable` は元の例外 (`cause`) をそのまま投げるので、ログには DB の失敗がそのまま出る
 */
export const unwrapOrThrow = <T, E extends ReadError>(
  result: Result<T, E>,
): T => {
  if (result.ok) {
    return result.value;
  }

  if (result.error.kind === "unavailable" && "cause" in result.error) {
    throw result.error.cause;
  }

  throw new Error(`port read failed: ${JSON.stringify(result.error)}`);
};
