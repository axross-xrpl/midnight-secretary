import type {
  CalendarEvent,
  CalendarPort,
  DateRange,
  EventTime,
} from "@/domain/calendar";
import { addDays } from "@/domain/dates";
import type {
  CalendarEventId,
  IsoDate,
  IsoDateTime,
} from "@/domain/identifiers";
import { mustParse, parseCalendarEventId } from "@/domain/identifiers.parse";
import { ok } from "@/lib/result";
import { jstDateOf, jstDateTimeOf } from "../jst";

/**
 * Fake のカレンダーが最初に持つ予定と、追加された予定に付ける id の生成関数
 */
export type FakeCalendarSeed = {
  events: readonly CalendarEvent[];
  newEventId: () => CalendarEventId;
};

const toEventId = (raw: string): CalendarEventId => {
  return mustParse(parseCalendarEventId(raw));
};

const timedOn = (date: IsoDate, from: string, to: string): EventTime => {
  return {
    kind: "timed",
    start: jstDateTimeOf(date, from),
    end: jstDateTimeOf(date, to),
  };
};

const startMs = (when: EventTime): number => {
  if (when.kind === "allDay") {
    return Date.parse(when.startDate);
  }

  return Date.parse(when.start);
};

// 終日の予定は `endDate` の始まりで終わるので、どちらの形も終了は排他の時点になる
const endMs = (when: EventTime): number => {
  if (when.kind === "allDay") {
    return Date.parse(when.endDate);
  }

  return Date.parse(when.end);
};

const overlaps = (event: CalendarEvent, range: DateRange): boolean => {
  return (
    startMs(event.when) < Date.parse(range.to) &&
    endMs(event.when) > Date.parse(range.from)
  );
};

const byStart = (a: CalendarEvent, b: CalendarEvent): number => {
  return startMs(a.when) - startMs(b.when);
};

/**
 * `now` を基準に置いた seed の予定で、30 日の窓に必ず見つかる出張が入るようにする
 *
 * 共有の demo 用 Google アカウントのカレンダーと同じ内容なので、real と fake の見た目が揃う
 * demo preset に限らず、カレンダーの port が fake のときは常に使う
 */
export const seedCalendarEvents = (now: IsoDateTime): CalendarEvent[] => {
  const today = jstDateOf(now);

  return [
    {
      id: toEventId("seed-1"),
      title: "チーム定例",
      when: timedOn(addDays(today, 2), "10:00", "11:00"),
    },

    {
      id: toEventId("seed-2"),
      title: "大阪出張 (取引先訪問)",
      when: timedOn(addDays(today, 5), "10:00", "17:00"),
      location: "大阪市北区",
    },

    {
      id: toEventId("seed-3"),
      title: "大阪出張 (展示会)",
      when: {
        kind: "allDay",
        startDate: addDays(today, 12),
        endDate: addDays(today, 14),
      },
      location: "大阪市住之江区",
    },

    {
      id: toEventId("seed-4"),
      title: "歯医者",
      when: timedOn(addDays(today, 8), "14:00", "15:00"),
      location: "品川",
    },
  ];
};

/**
 * メモリ上のカレンダー
 *
 * `listEvents` は期間で絞り、`insertEvent` はプロセスが生きている間追加し続ける
 * 書き戻した予定がリクエストをまたいで残るよう、プロセスごとに 1 回だけ作る
 */
export const createFakeCalendar = (seed: FakeCalendarSeed): CalendarPort => {
  // 追加された予定はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
  const state = { events: seed.events };

  return {
    listEvents: async (range) =>
      ok(
        state.events
          .filter((event) => overlaps(event, range))
          .toSorted(byStart),
      ),
    getEvent: async (eventId) =>
      ok(state.events.find((event) => event.id === eventId)),
    insertEvent: async (draft) => {
      const event = { ...draft, id: seed.newEventId() };

      state.events = [...state.events, event];

      return ok(event);
    },
  };
};
