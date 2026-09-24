import "server-only";

import type { SettingsDeps } from "@/adapters/factories";
import { settingsDepsFor } from "@/adapters/runtime";
import { mustParse, parseIsoDateTime } from "@/domain/identifiers.parse";
import type { Result } from "@/lib/result";

/**
 * いま処理中のリクエストの設定画面の deps
 *
 * Server Component と Route Handler のどちらからも呼ぶ (セッションは呼び出し側が確かめる)
 */
export const settingsDeps = (): SettingsDeps => {
  // secretaryContext と同じく、時刻は境界で取る
  const now = mustParse(parseIsoDateTime(new Date().toISOString()));

  return settingsDepsFor({ now });
};

/**
 * 設定画面 (Server Component) の読み取りの失敗を例外に戻す
 *
 * 画面は読めなかったときの表示を持たず、今までどおり Next のエラー画面に届ける
 * 元の例外 (`cause`) をそのまま投げるので、ログには DB の失敗がそのまま出る
 */
export const valueOrThrow = <T>(
  result: Result<T, { kind: "unavailable"; cause: unknown }>,
): T => {
  if (!result.ok) {
    throw result.error.cause;
  }

  return result.value;
};
