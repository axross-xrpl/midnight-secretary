import "server-only";

import { settingsDepsFor } from "@/adapters/runtime";
import type { SettingsDeps } from "@/application/wiring";
import { mustParse, parseIsoDateTime } from "@/domain/identifiers.parse";

/**
 * いま処理中のリクエストのための設定画面の deps
 *
 * Server Component と Route Handler のどちらからも呼べる (セッションは呼び出し側が確かめる)
 * source の解決は runtime に任せるので、demo では Fake、それ以外では Neon が入る
 */
export const settingsDeps = (): SettingsDeps => {
  return settingsDepsFor({
    now: mustParse(parseIsoDateTime(new Date().toISOString())),
  });
};
