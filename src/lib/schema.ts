import type { Result } from "./result";
import { err, ok } from "./result";

/**
 * スキーマ検証の失敗 1 件
 */
export type SchemaIssue = {
  path: readonly PropertyKey[];
  message: string;
};

/**
 * スキーマ検証の失敗(kind タグ付き)
 */
export type SchemaError = {
  kind: "schema";
  issues: readonly SchemaIssue[];
};

/**
 * Zod の safeParse 互換の戻り値(構造的型なので zod 本体への依存は無い)
 */
export type SafeParseLike<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: readonly SchemaIssue[] } };

/**
 * safeParse の戻り値を Result に変換する(Parse, Don't Validate の境界で使う)
 */
export const fromZod = <T>(
  parsed: SafeParseLike<T>,
): Result<T, SchemaError> => {
  if (parsed.success) {
    return ok(parsed.data);
  }

  return err({
    kind: "schema",
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  });
};
