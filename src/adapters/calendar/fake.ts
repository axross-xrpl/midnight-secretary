import type { CalendarEvent, CalendarPort } from "@/domain/calendar";
import type { CalendarEventId, IsoDateTime } from "@/domain/identifiers";
import { ok } from "@/lib/result";

/**
 * Fake のカレンダーが最初に持つ予定と、追加された予定に付ける id の生成関数
 */
export type FakeCalendarSeed = {
  events: readonly CalendarEvent[];
  newEventId: () => CalendarEventId;
};

/**
 * `now` を基準に置いた seed の予定で、30 日の窓に必ず見つかる出張が入るようにする
 *
 * 共有の demo 用 Google アカウントのカレンダーと同じ内容なので、real と fake の見た目が揃う
 * demo preset に限らず、カレンダーの port が fake のときは常に使う
 */
export const seedCalendarEvents = (_now: IsoDateTime): CalendarEvent[] => {
  return [];
};

/**
 * メモリ上のカレンダー
 *
 * `listEvents` は期間で絞り、`insertEvent` はプロセスが生きている間追加し続ける
 * 書き戻した予定がリクエストをまたいで残るよう、プロセスごとに 1 回だけ作る
 */
export const createFakeCalendar = (seed: FakeCalendarSeed): CalendarPort => {
  return {
    listEvents: async () => ok(seed.events),
    getEvent: async () => ok(undefined),
    insertEvent: async (draft) => ok({ ...draft, id: seed.newEventId() }),
  };
};
