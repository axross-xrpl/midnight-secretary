import "server-only";

import type { SecretaryContext } from "@/adapters/auth/session";
import type { SecretaryError } from "@/application/errors";
import { loadDashboard, loadLedgerViews } from "@/application/secretary";
import type { CalendarEvent, DateRange } from "@/domain/calendar";
import type { CalendarEventId, IsoDateTime } from "@/domain/identifiers";
import { mustParse, parseIsoDateTime } from "@/domain/identifiers.parse";
import type { Mandate, PublicLedgerView } from "@/domain/mandate";
import type { Trip } from "@/domain/trip";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

/**
 * 会話画面が見る窓の長さ (日)
 *
 * scan route の `SCAN_WINDOW_DAYS` と同じ 30 日で、今日から先だけを見る
 */
const CHAT_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// 正しい時点から組み立てた時点は正しいので、ここでのパース失敗はバグ
const isoAt = (ms: number): IsoDateTime => {
  return mustParse(parseIsoDateTime(new Date(ms).toISOString()));
};

/**
 * `now` から 30 日先までの半開区間
 */
export const chatRange = (now: IsoDateTime): DateRange => {
  return {
    from: now,
    to: isoAt(Date.parse(now) + CHAT_WINDOW_DAYS * DAY_MS),
  };
};

/**
 * ページが 1 回の描画で要るものすべて
 *
 * `Conversation` の props にそのまま渡す (brand は代入で外れる)
 * `LedgerViews.privateMandate` は `Dashboard.mandate` と同じ値なので渡さない
 */
export type ChatData = {
  now: IsoDateTime;
  event: CalendarEvent;
  mandate?: Mandate;
  trip?: Trip;
  publicLedger: PublicLedgerView;
};

/**
 * 会話画面の読み込みの失敗
 *
 * use case の失敗に、予定が窓 (30 日) に無いことを足したもの
 */
export type ChatLoadError =
  | SecretaryError
  | { kind: "eventNotFound"; eventId: CalendarEventId };

/**
 * `loadDashboard` と `loadLedgerViews` を合わせ、予定 id で予定と trip を絞る
 *
 * 最初の失敗で止め、予定が窓に無ければ `eventNotFound`
 */
export const loadChatData = async (
  context: SecretaryContext,
  eventId: CalendarEventId,
): Promise<Result<ChatData, ChatLoadError>> => {
  const [dashboard, ledger] = await Promise.all([
    loadDashboard(context.userId, chatRange(context.now), context.deps),
    loadLedgerViews(context.userId, context.deps),
  ]);

  if (!dashboard.ok) {
    return dashboard;
  }

  if (!ledger.ok) {
    return ledger;
  }

  const event = dashboard.value.events.find(
    (candidate) => candidate.id === eventId,
  );

  if (event === undefined) {
    return err({ kind: "eventNotFound", eventId });
  }

  const trip = dashboard.value.trips.find(
    (candidate) => candidate.event.id === eventId,
  );

  return ok({
    now: context.now,
    event,
    ...(dashboard.value.mandate === undefined
      ? {}
      : { mandate: dashboard.value.mandate }),
    ...(trip === undefined ? {} : { trip }),
    publicLedger: ledger.value.publicLedger,
  });
};
