import "server-only";

import type { SecretaryContext } from "@/adapters/auth/session";
import type { SecretaryError } from "@/application/errors";
import {
  loadConfirmedTrips,
  loadDashboard,
  loadTrips,
} from "@/application/secretary";
import type { TasksQuery } from "@/components/tasks/query";
import type { CalendarEvent } from "@/domain/calendar";
import type { IsoDateTime } from "@/domain/identifiers";
import type { ConfirmedTrip } from "@/domain/store";
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
 * `trips` は進行中の出張 (メモリ)、`confirmed` は DB に写した確定旅程で、読み取り先が違うので分けて持つ
 * 支払い枠は会話画面で見せるので持たない
 */
export type TasksData = {
  now: IsoDateTime;
  trips: readonly Trip[];
  confirmed: readonly ConfirmedTrip[];
  scan: ScanState;
};

// スキャン済みは会話画面と同じ窓 (`chatRange`) でカレンダーも読む (`loadDashboard` が読む mandate は使わない)
const loadScanned = async (
  context: SecretaryContext,
): Promise<Result<TasksData, SecretaryError>> => {
  const [dashboard, confirmed] = await Promise.all([
    loadDashboard(context.userId, chatRange(context.now), context.deps),
    loadConfirmedTrips(context.userId, context.deps),
  ]);

  if (!dashboard.ok) {
    return dashboard;
  }

  if (!confirmed.ok) {
    return confirmed;
  }

  return ok({
    now: context.now,
    trips: dashboard.value.trips,
    confirmed: confirmed.value,
    scan: { kind: "scanned", events: dashboard.value.events },
  });
};

// スキャン前は出張だけを読む (進行中と確定旅程は並列に読む)
const loadNotScanned = async (
  context: SecretaryContext,
): Promise<Result<TasksData, SecretaryError>> => {
  const [trips, confirmed] = await Promise.all([
    loadTrips(context.userId, context.deps),
    loadConfirmedTrips(context.userId, context.deps),
  ]);

  if (!trips.ok) {
    return trips;
  }

  if (!confirmed.ok) {
    return confirmed;
  }

  return ok({
    now: context.now,
    trips: trips.value,
    confirmed: confirmed.value,
    scan: { kind: "notScanned" },
  });
};

/**
 * `query.scan` なら `loadDashboard` を会話画面と同じ窓 (`chatRange`) で、そうでなければ `loadTrips` を呼ぶ
 *
 * 確定旅程はどちらでも読む
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
