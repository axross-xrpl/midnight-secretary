import "server-only";

import type { SecretaryContext } from "@/adapters/auth/session";
import type { SecretaryError } from "@/application/errors";
import { loadDashboard, loadLedgerViews } from "@/application/secretary";
import type { CalendarEvent, DateRange } from "@/domain/calendar";
import type { IsoDateTime } from "@/domain/identifiers";
import { mustParse, parseIsoDateTime } from "@/domain/identifiers.parse";
import type { Mandate, PublicLedgerView } from "@/domain/mandate";
import type { Trip } from "@/domain/trip";
import type { Result } from "@/lib/result";
import { ok } from "@/lib/result";

/**
 * ダッシュボードが見る窓の長さ (日)
 *
 * scan route の `SCAN_WINDOW_DAYS` と同じ 30 日で、今日から先だけを見る
 */
export const DASHBOARD_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// 正しい時点から組み立てた時点は正しいので、ここでのパース失敗はバグ
const isoAt = (ms: number): IsoDateTime => {
  return mustParse(parseIsoDateTime(new Date(ms).toISOString()));
};

/**
 * `now` から 30 日先までの半開区間
 */
export const dashboardRange = (now: IsoDateTime): DateRange => {
  return {
    from: now,
    to: isoAt(Date.parse(now) + DASHBOARD_WINDOW_DAYS * DAY_MS),
  };
};

/**
 * ページが 1 回の描画で要るものすべて
 *
 * `SecretaryDashboard` の props にそのまま渡す (brand は代入で外れる)
 * `LedgerViews.privateMandate` は `Dashboard.mandate` と同じ値なので渡さない
 */
export type DashboardData = {
  now: IsoDateTime;
  mandate?: Mandate;
  events: readonly CalendarEvent[];
  trips: readonly Trip[];
  publicLedger: PublicLedgerView;
};

/**
 * `loadDashboard` と `loadLedgerViews` を合わせて、最初の失敗で止める
 */
export const loadDashboardData = async (
  context: SecretaryContext,
): Promise<Result<DashboardData, SecretaryError>> => {
  const [dashboard, ledger] = await Promise.all([
    loadDashboard(context.userId, dashboardRange(context.now), context.deps),
    loadLedgerViews(context.userId, context.deps),
  ]);

  if (!dashboard.ok) {
    return dashboard;
  }

  if (!ledger.ok) {
    return ledger;
  }

  return ok({
    now: context.now,
    ...(dashboard.value.mandate === undefined
      ? {}
      : { mandate: dashboard.value.mandate }),
    events: dashboard.value.events,
    trips: dashboard.value.trips,
    publicLedger: ledger.value.publicLedger,
  });
};
