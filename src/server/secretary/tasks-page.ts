import "server-only";

import type { SecretaryContext } from "@/adapters/auth/session";
import type { SecretaryError } from "@/application/errors";
import { loadDashboard, loadTrips } from "@/application/secretary";
import type { TasksQuery } from "@/components/tasks/query";
import type { CalendarEvent } from "@/domain/calendar";
import type { IsoDateTime } from "@/domain/identifiers";
import type { Trip } from "@/domain/trip";
import type { Result } from "@/lib/result";
import { ok } from "@/lib/result";
import { chatRange } from "./chat-page";

/**
 * スキャンの状態
 *
 * スキャン済みのときだけ窓の予定を持つ
 */
export type ScanState =
  | { kind: "notScanned" }
  | { kind: "scanned"; events: readonly CalendarEvent[] };

/**
 * 予定一覧が 1 回の描画で要るものすべて
 *
 * `candidateEventsOf` などの純粋関数にそのまま渡す (brand は代入で外れる)
 * 支払い枠は会話画面で見せるので持たない
 */
export type TasksData = {
  now: IsoDateTime;
  trips: readonly Trip[];
  scan: ScanState;
};

// スキャン済みは会話画面と同じ窓 (`chatRange`) でカレンダーも読む (`loadDashboard` が読む mandate は使わない)
const loadScanned = async (
  context: SecretaryContext,
): Promise<Result<TasksData, SecretaryError>> => {
  const dashboard = await loadDashboard(
    context.userId,
    chatRange(context.now),
    context.deps,
  );

  if (!dashboard.ok) {
    return dashboard;
  }

  return ok({
    now: context.now,
    trips: dashboard.value.trips,
    scan: { kind: "scanned", events: dashboard.value.events },
  });
};

// スキャン前は trip だけを読む
const loadNotScanned = async (
  context: SecretaryContext,
): Promise<Result<TasksData, SecretaryError>> => {
  const trips = await loadTrips(context.userId, context.deps);

  if (!trips.ok) {
    return trips;
  }

  return ok({
    now: context.now,
    trips: trips.value,
    scan: { kind: "notScanned" },
  });
};

/**
 * `query.scan` なら `loadDashboard` を会話画面と同じ窓 (`chatRange`) で、そうでなければ `loadTrips` を呼ぶ
 *
 * 台帳は読まない
 */
export const loadTasksData = async (
  context: SecretaryContext,
  query: TasksQuery,
): Promise<Result<TasksData, SecretaryError>> => {
  if (query.scan) {
    return loadScanned(context);
  }

  return loadNotScanned(context);
};
