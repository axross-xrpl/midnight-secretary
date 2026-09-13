import { match } from "ts-pattern";

/**
 * `/tasks` のタブ
 */
export type TasksTab = "detect" | "trips";

/**
 * `/tasks` の URL が指す表示
 *
 * `scan` は検知タブでだけ真になる (確定旅程タブはカレンダーを読まない)
 */
export type TasksQuery = {
  tab: TasksTab;
  scan: boolean;
};

// Next.js の searchParams の値 1 つ (同じキーが 2 回あると配列になる)
type RawValue = string | readonly string[] | undefined;

// 配列なら先頭を見る
const firstOf = (value: RawValue): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  return value?.[0];
};

/**
 * Next.js の searchParams (値は string | string[] | undefined) を解釈する
 *
 * `tab=trips` だけが確定旅程で、それ以外は検知
 * `scan=1` のときだけスキャン済み (配列なら先頭を見る)
 */
export const parseTasksQuery = (
  raw: Readonly<Record<string, string | readonly string[] | undefined>>,
): TasksQuery => {
  const tab: TasksTab = firstOf(raw.tab) === "trips" ? "trips" : "detect";
  const scan = tab === "detect" && firstOf(raw.scan) === "1";

  return { tab, scan };
};

/**
 * 表示に対応する `/tasks` の href (ロケールは Link が付ける)
 *
 * 検知は `/tasks`、スキャン済みは `/tasks?scan=1`、確定旅程は `/tasks?tab=trips`
 */
export const tasksHref = (query: TasksQuery): string => {
  return match(query)
    .with({ tab: "trips" }, () => "/tasks?tab=trips")
    .with({ tab: "detect", scan: true }, () => "/tasks?scan=1")
    .with({ tab: "detect", scan: false }, () => "/tasks")
    .exhaustive();
};

/**
 * 予定 1 件の会話画面 `/tasks/[eventId]` の href (ロケールは Link が付ける)
 *
 * pathnames の定義が無いので、予定 id をそのまま path segment にする
 */
export const chatHref = (eventId: string): string => {
  return `/tasks/${encodeURIComponent(eventId)}`;
};
