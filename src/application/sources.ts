import { z } from "zod";
import type { Result } from "@/lib/result";
import { ok } from "@/lib/result";

/**
 * port 1 つの実装をどこから持ってくるか
 *
 * `real` は外部システムと通信し、`fake` は同じレーンが持つプロセス内の代役
 * `SecretaryError.source` (失敗がどの port から来たか) とは別の意味
 */
export const portSourceSchema = z.enum(["real", "fake"]);

/**
 * ユーザがどうサインインするか
 *
 * `dev` は Google を使わず固定のユーザでサインインするので、そのセッションに Google のトークンは存在しない
 */
export const authSourceSchema = z.enum(["google", "dev"]);

/**
 * すべての source を一度に埋める preset
 *
 * port ごとの変数は preset より優先される
 * `normal` はすべて real (既定値)、`demo` はすべて fake で dev サインイン
 */
export const sourceModeSchema = z.enum(["normal", "demo"]);

export type PortSource = z.infer<typeof portSourceSchema>;

export type AuthSource = z.infer<typeof authSourceSchema>;

export type SourceMode = z.infer<typeof sourceModeSchema>;

/**
 * 独立して切り替えられる port
 *
 * レーンの担当者 1 人につき 1 つ
 */
export type PortName = "calendar" | "catalog" | "planner" | "mandate" | "store";

/**
 * auth の両方の variant に共通する source
 */
export type SwitchablePortSources = {
  catalog: PortSource;
  planner: PortSource;
  mandate: PortSource;
  store: PortSource;
};

/**
 * このプロセスで解決された、すべての port の source
 *
 * `dev` サインインには Google のトークンが無いので、その variant ではカレンダーは fake にしかできない
 */
export type PortSources =
  | ({ auth: "google"; calendar: PortSource } & SwitchablePortSources)
  | ({ auth: "dev"; calendar: "fake" } & SwitchablePortSources);

/**
 * `parsePortSources` が読む環境変数
 *
 * 値は上のスキーマのリテラル
 */
export const SOURCE_ENV_KEYS = {
  mode: "SECRETARY_MODE",
  auth: "SECRETARY_AUTH",
  calendar: "SECRETARY_CALENDAR",
  catalog: "SECRETARY_CATALOG",
  planner: "SECRETARY_PLANNER",
  mandate: "SECRETARY_MANDATE",
  store: "SECRETARY_STORE",
} as const satisfies Record<PortName | "mode" | "auth", string>;

/**
 * すべて real
 *
 * 変数が何も設定されていないときの既定値なので、本番で誤って Fake が動くことはない
 */
export const REAL_SOURCES = {
  auth: "google",
  calendar: "real",
  catalog: "real",
  planner: "real",
  mandate: "real",
  store: "real",
} as const satisfies PortSources;

/**
 * すべて fake で dev サインイン
 *
 * Google のプロジェクト、データベース、LLM のキー、Midnight のノードが無くても動く
 */
export const DEMO_SOURCES = {
  auth: "dev",
  calendar: "fake",
  catalog: "fake",
  planner: "fake",
  mandate: "fake",
  store: "fake",
} as const satisfies PortSources;

/**
 * process.env の部分集合
 *
 * パースを純粋でテスト可能に保つために引数で渡す
 */
export type EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * source の変数を `PortSources` にできなかった理由
 */
export type SourcesError =
  | {
      kind: "invalidValue";
      key: string;
      value: string;
      allowed: readonly string[];
    }
  | { kind: "realCalendarNeedsGoogleAuth" };

/**
 * 環境変数から port の source を解決する
 *
 * port ごとの優先順位は、その port 自身の変数、次に `SECRETARY_MODE`、最後に `REAL_SOURCES`
 * `SECRETARY_AUTH=dev` と `SECRETARY_CALENDAR=real` の組み合わせは、黙って格下げせずに拒否する
 */
export const parsePortSources = (
  _env: EnvLike,
): Result<PortSources, SourcesError> => {
  return ok(REAL_SOURCES);
};

/**
 * 画面の注意書きのために、いま Fake が担当している port を返す
 *
 * 空ならプロセスはすべて real で動いている
 */
export const activeFakes = (_sources: PortSources): readonly PortName[] => {
  return [];
};
