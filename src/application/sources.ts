import { z } from "zod";
import type { Result } from "@/lib/result";
import { all, err, fromThrowable, ok } from "@/lib/result";
import type { SafeParseLike } from "@/lib/schema";

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
 * 切り替えられる port の一覧を、パースされ画面に並ぶ順で持つ
 *
 * ここに port を足すと、コンパイラが他に必要な箇所をすべて列挙する
 */
export const PORT_NAMES = [
  "calendar",
  "catalog",
  "planner",
  "mandate",
  "store",
] as const;

/**
 * 独立して切り替えられる port
 *
 * レーンの担当者 1 人につき 1 つ
 */
export type PortName = (typeof PORT_NAMES)[number];

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
 * `nextAuthUrl` は next-auth 自身の変数で、ここでは dev サインインを localhost に限るためだけに読む
 */
export const SOURCE_ENV_KEYS = {
  mode: "SECRETARY_MODE",
  auth: "SECRETARY_AUTH",
  nextAuthUrl: "NEXTAUTH_URL",
  calendar: "SECRETARY_CALENDAR",
  catalog: "SECRETARY_CATALOG",
  planner: "SECRETARY_PLANNER",
  mandate: "SECRETARY_MANDATE",
  store: "SECRETARY_STORE",
} as const satisfies Record<PortName | "mode" | "auth" | "nextAuthUrl", string>;

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
  | { kind: "realCalendarNeedsGoogleAuth" }
  | { kind: "devAuthRequiresLocalhost"; nextAuthUrl: string };

// zod の enum のうちこのモジュールが必要とする部分で、受け付けるリテラルと throw しないパース
type EnumSchema<T extends string> = {
  options: readonly T[];
  safeParse: (value: unknown) => SafeParseLike<T>;
};

// dev サインインはボタンを押した人を誰でも信用するので、公開ホストで応答してはならない
const LOCALHOST_HOSTNAMES: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "[::1]",
];

const parseEnvValue = <T extends string>(
  key: string,
  raw: string | undefined,
  fallback: T,
  schema: EnumSchema<T>,
): Result<T, SourcesError> => {
  if (raw === undefined) {
    return ok(fallback);
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return err({
      kind: "invalidValue",
      key,
      value: raw,
      allowed: schema.options,
    });
  }

  return ok(parsed.data);
};

const presetFor = (mode: SourceMode): PortSources => {
  if (mode === "demo") {
    return DEMO_SOURCES;
  }

  return REAL_SOURCES;
};

const checkDevAuthUrl = (
  raw: string | undefined,
): Result<undefined, SourcesError> => {
  const rejected: SourcesError = {
    kind: "devAuthRequiresLocalhost",
    nextAuthUrl: raw ?? "",
  };
  const url = fromThrowable(
    () => new URL(raw ?? ""),
    () => rejected,
  );

  if (!url.ok) {
    return url;
  }

  if (!LOCALHOST_HOSTNAMES.includes(url.value.hostname)) {
    return err(rejected);
  }

  return ok(undefined);
};

/**
 * 環境変数から port の source を解決する
 *
 * port ごとの優先順位は、その port 自身の変数、次に `SECRETARY_MODE`、最後に `REAL_SOURCES`
 * `SECRETARY_AUTH=dev` と `SECRETARY_CALENDAR=real` の組み合わせは、黙って格下げせずに拒否する
 */
export const parsePortSources = (
  env: EnvLike,
): Result<PortSources, SourcesError> => {
  const mode = parseEnvValue(
    SOURCE_ENV_KEYS.mode,
    env[SOURCE_ENV_KEYS.mode],
    "normal",
    sourceModeSchema,
  );

  if (!mode.ok) {
    return mode;
  }

  const preset = presetFor(mode.value);
  const auth = parseEnvValue(
    SOURCE_ENV_KEYS.auth,
    env[SOURCE_ENV_KEYS.auth],
    preset.auth,
    authSourceSchema,
  );

  if (!auth.ok) {
    return auth;
  }

  const ports = all(
    PORT_NAMES.map((port) =>
      parseEnvValue(
        SOURCE_ENV_KEYS[port],
        env[SOURCE_ENV_KEYS[port]],
        preset[port],
        portSourceSchema,
      ),
    ),
  );

  if (!ports.ok) {
    return ports;
  }

  // パースした値は PORT_NAMES の順で返る
  const [calendar, catalog, planner, mandate, store] = ports.value;

  if (auth.value === "dev" && calendar === "real") {
    return err({ kind: "realCalendarNeedsGoogleAuth" });
  }

  if (auth.value === "dev") {
    const localhost = checkDevAuthUrl(env[SOURCE_ENV_KEYS.nextAuthUrl]);

    if (!localhost.ok) {
      return localhost;
    }

    return ok({
      auth: "dev",
      calendar: "fake",
      catalog,
      planner,
      mandate,
      store,
    });
  }

  return ok({ auth: "google", calendar, catalog, planner, mandate, store });
};

/**
 * 画面の注意書きのために、いま Fake が担当している port を返す
 *
 * 空ならプロセスはすべて real で動いている
 */
export const activeFakes = (sources: PortSources): readonly PortName[] => {
  return PORT_NAMES.filter((port) => sources[port] === "fake");
};
