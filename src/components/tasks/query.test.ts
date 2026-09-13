import { describe, expect, test } from "vitest";
import type { TasksQuery } from "./query";
import { chatHref, parseTasksQuery, tasksHref } from "./query";

const DETECT: TasksQuery = { tab: "detect", scan: false };

const SCANNED: TasksQuery = { tab: "detect", scan: true };

const TRIPS: TasksQuery = { tab: "trips", scan: false };

// href の query string を Next.js の searchParams と同じ形にする
const searchParamsOf = (href: string): Record<string, string> => {
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
};

describe("parseTasksQuery", () => {
  test("tab が無ければ検知で、スキャン前", () => {
    expect(parseTasksQuery({})).toStrictEqual(DETECT);
  });

  test("tab=detect は検知", () => {
    expect(parseTasksQuery({ tab: "detect" })).toStrictEqual(DETECT);
  });

  test("tab=trips は確定旅程", () => {
    expect(parseTasksQuery({ tab: "trips" })).toStrictEqual(TRIPS);
  });

  test("知らない tab は検知", () => {
    expect(parseTasksQuery({ tab: "archive" })).toStrictEqual(DETECT);
    expect(parseTasksQuery({ tab: "" })).toStrictEqual(DETECT);
  });

  test("tab が配列なら先頭を見る", () => {
    expect(parseTasksQuery({ tab: ["trips", "detect"] })).toStrictEqual(TRIPS);
    expect(parseTasksQuery({ tab: ["detect", "trips"] })).toStrictEqual(DETECT);
  });

  test("scan=1 でスキャン済み", () => {
    expect(parseTasksQuery({ scan: "1" })).toStrictEqual(SCANNED);
  });

  test("scan が配列なら先頭を見る", () => {
    expect(parseTasksQuery({ scan: ["1", "0"] })).toStrictEqual(SCANNED);
    expect(parseTasksQuery({ scan: ["0", "1"] })).toStrictEqual(DETECT);
  });

  test("scan が無いか 1 以外ならスキャン前", () => {
    expect(parseTasksQuery({ scan: undefined })).toStrictEqual(DETECT);
    expect(parseTasksQuery({ scan: "" })).toStrictEqual(DETECT);
    expect(parseTasksQuery({ scan: "true" })).toStrictEqual(DETECT);
    expect(parseTasksQuery({ scan: [] })).toStrictEqual(DETECT);
  });

  test("確定旅程では scan=1 でもスキャンしない", () => {
    expect(parseTasksQuery({ tab: "trips", scan: "1" })).toStrictEqual(TRIPS);
  });

  test("知らないキーは無視する", () => {
    expect(parseTasksQuery({ page: "2", scan: "1" })).toStrictEqual(SCANNED);
  });
});

describe("tasksHref", () => {
  test("検知は /tasks", () => {
    expect(tasksHref(DETECT)).toBe("/tasks");
  });

  test("スキャン済みは /tasks?scan=1", () => {
    expect(tasksHref(SCANNED)).toBe("/tasks?scan=1");
  });

  test("確定旅程は /tasks?tab=trips", () => {
    expect(tasksHref(TRIPS)).toBe("/tasks?tab=trips");
  });

  test("href を searchParams として読み直すと同じ表示になる", () => {
    expect(parseTasksQuery(searchParamsOf(tasksHref(DETECT)))).toStrictEqual(
      DETECT,
    );
    expect(parseTasksQuery(searchParamsOf(tasksHref(SCANNED)))).toStrictEqual(
      SCANNED,
    );
    expect(parseTasksQuery(searchParamsOf(tasksHref(TRIPS)))).toStrictEqual(
      TRIPS,
    );
  });
});

describe("chatHref", () => {
  test("予定 id を path segment にし、検知タブからならクエリ無し", () => {
    expect(chatHref("seed-2", "detect")).toBe("/tasks/seed-2");
  });

  test("path に使えない文字はエスケープする", () => {
    expect(chatHref("a/b c", "detect")).toBe("/tasks/a%2Fb%20c");
  });

  test("確定旅程タブからなら tab=trips を添える", () => {
    expect(chatHref("seed-2", "trips")).toBe("/tasks/seed-2?tab=trips");
  });
});
