/**
 * 成功を表す Result
 */
export type Ok<T> = { ok: true; value: T };

/**
 * 失敗を表す Result
 */
export type Err<E> = { ok: false; error: E };

/**
 * 成功か失敗かを値として表す型(plain object なのでシリアライズ可能)
 *
 * エラー E は「期待される失敗」を kind タグ付き discriminated union で表現する。
 * プログラムのバグは Result に包まず throw で即死させる。
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * 成功の Result を作る
 */
export const ok = <T>(value: T): Ok<T> => {
  return { ok: true, value };
};

/**
 * 失敗の Result を作る
 */
export const err = <E>(error: E): Err<E> => {
  return { ok: false, error };
};

/**
 * 成功かどうかを絞り込む型ガード
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => {
  return result.ok;
};

/**
 * 失敗かどうかを絞り込む型ガード
 */
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => {
  return !result.ok;
};

/**
 * 成功値を変換する(失敗はそのまま通す)
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => U,
): Result<U, E> => {
  if (!result.ok) {
    return result;
  }

  return ok(f(result.value));
};

/**
 * エラー値を変換する(成功はそのまま通す)
 */
export const mapErr = <T, E, F>(
  result: Result<T, E>,
  f: (error: E) => F,
): Result<T, F> => {
  if (result.ok) {
    return result;
  }

  return err(f(result.error));
};

/**
 * 成功値に Result を返す関数を適用して平坦化する
 */
export const andThen = <T, U, E, F>(
  result: Result<T, E>,
  f: (value: T) => Result<U, F>,
): Result<U, E | F> => {
  if (!result.ok) {
    return result;
  }

  return f(result.value);
};

/**
 * 失敗からの回復を試みる(成功はそのまま通す)
 */
export const orElse = <T, E, U, F>(
  result: Result<T, E>,
  f: (error: E) => Result<U, F>,
): Result<T | U, F> => {
  if (result.ok) {
    return result;
  }

  return f(result.error);
};

/**
 * 成功・失敗それぞれのハンドラで単一の値に畳み込む
 */
export const match = <T, E, U>(
  result: Result<T, E>,
  onOk: (value: T) => U,
  onErr: (error: E) => U,
): U => {
  if (result.ok) {
    return onOk(result.value);
  }

  return onErr(result.error);
};

/**
 * 成功値を取り出す(失敗ならフォールバック値を返す)
 */
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T => {
  if (result.ok) {
    return result.value;
  }

  return fallback;
};

/**
 * Result の配列を単一の Result にまとめる(最初の失敗で short-circuit する)
 */
export const all = <T, E>(results: readonly Result<T, E>[]): Result<T[], E> => {
  const firstErr = results.find(isErr);

  if (firstErr !== undefined) {
    return firstErr;
  }

  return ok(results.filter(isOk).map((r) => r.value));
};

/**
 * Result の配列を成功値と失敗値に振り分ける
 */
export const partition = <T, E>(
  results: readonly Result<T, E>[],
): { values: T[]; errors: E[] } => {
  return {
    values: results.filter(isOk).map((r) => r.value),
    errors: results.filter(isErr).map((r) => r.error),
  };
};

/**
 * throw しうる関数を実行して Result に変換する(境界用)
 */
export const fromThrowable = <T, E>(
  f: () => T,
  onThrow: (thrown: unknown) => E,
): Result<T, E> => {
  try {
    return ok(f());
  } catch (thrown) {
    return err(onThrow(thrown));
  }
};

/**
 * reject しうる Promise を Result に変換する(境界用)
 */
export const fromPromise = async <T, E>(
  promise: Promise<T>,
  onReject: (thrown: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await promise);
  } catch (thrown) {
    return err(onReject(thrown));
  }
};
