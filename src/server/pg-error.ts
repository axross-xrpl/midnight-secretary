import "server-only";

type PostgresError = { cause?: unknown; code?: unknown };

/**
 * ドライバが包んだ例外から PostgreSQL のエラーコードを取り出す
 *
 * neon-http は元の例外を `cause` で包むので、数段だけ辿る
 * 見つからなければ想定外の失敗なので `null` を返し、呼び出し側で throw させる
 */
export function postgresErrorCode(error: unknown): string | null {
  let current = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return null;
    }

    const { cause, code } = current as PostgresError;

    if (typeof code === "string") {
      return code;
    }

    current = cause;
  }

  return null;
}
