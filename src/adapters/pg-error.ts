import "server-only";

// neon-http は元の例外を drizzle の例外の `cause` で包むので、数段だけ辿れば足りる
const CAUSE_DEPTH = 4;

/**
 * ドライバが包んだ例外から PostgreSQL のエラーコードを取り出す
 *
 * `cause` の入れ子を `depth` 段まで辿り、最初に見つかった文字列の `code` を返す
 * 見つからなければ想定外の失敗なので undefined を返し、呼び出し側で unavailable にさせる
 */
export const postgresErrorCode = (
  error: unknown,
  depth = CAUSE_DEPTH,
): string | undefined => {
  // 例外は何でも投げられるので、境界として null と比べる
  if (depth === 0 || typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if (!("cause" in error)) {
    return undefined;
  }

  return postgresErrorCode(error.cause, depth - 1);
};
