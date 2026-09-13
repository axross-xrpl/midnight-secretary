import { describe, expect, test } from "vitest";
import type { CalendarEvent, DateRange } from "@/domain/calendar";
import type { CalendarEventId } from "@/domain/identifiers";
import {
  mustParse,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import { createFakeCalendar, seedCalendarEvents } from "./fake";

const NOW = mustParse(parseIsoDateTime("2026-09-09T09:00:00+09:00"));

const eventId = (raw: string): CalendarEventId => {
  return mustParse(parseCalendarEventId(raw));
};

const range = (from: string, to: string): DateRange => {
  return {
    from: mustParse(parseIsoDateTime(from)),
    to: mustParse(parseIsoDateTime(to)),
  };
};

const timedEvent = (id: string, start: string, end: string): CalendarEvent => {
  return {
    id: eventId(id),
    title: id,
    when: {
      kind: "timed",
      start: mustParse(parseIsoDateTime(start)),
      end: mustParse(parseIsoDateTime(end)),
    },
  };
};

const allDayEvent = (
  id: string,
  startDate: string,
  endDate: string,
): CalendarEvent => {
  return {
    id: eventId(id),
    title: id,
    when: {
      kind: "allDay",
      startDate: mustParse(parseIsoDate(startDate)),
      endDate: mustParse(parseIsoDate(endDate)),
    },
  };
};

const idsOf = (events: readonly CalendarEvent[]): readonly string[] => {
  return events.map((event) => event.id);
};

const scanned = [
  timedEvent(
    "meeting",
    "2026-09-14T10:00:00+09:00",
    "2026-09-14T17:00:00+09:00",
  ),

  allDayEvent("all-day", "2026-09-11", "2026-09-12"),

  timedEvent("spans", "2026-09-08T09:00:00+09:00", "2026-09-09T12:00:00+09:00"),

  timedEvent(
    "ends-at-from",
    "2026-09-08T09:00:00+09:00",
    "2026-09-09T00:00:00+09:00",
  ),

  timedEvent(
    "starts-at-to",
    "2026-09-16T00:00:00+09:00",
    "2026-09-16T17:00:00+09:00",
  ),
];

const window = range("2026-09-09T00:00:00+09:00", "2026-09-16T00:00:00+09:00");

const newEventId = () => {
  return eventId("inserted-1");
};

describe("seedCalendarEvents", () => {
  test("now を基準にした 4 件を返す", () => {
    const events = seedCalendarEvents(NOW);

    expect(idsOf(events)).toStrictEqual([
      "seed-1",
      "seed-2",
      "seed-3",
      "seed-4",
    ]);
    expect(events.map((event) => event.title)).toStrictEqual([
      "チーム定例",
      "大阪出張 (取引先訪問)",
      "大阪出張 (展示会)",
      "歯医者",
    ]);
  });

  test("取引先訪問は時刻あり、展示会は終日になる", () => {
    const events = seedCalendarEvents(NOW);

    expect(
      events.find((event) => event.location === "大阪市北区")?.when,
    ).toStrictEqual({
      kind: "timed",
      start: "2026-09-14T10:00:00+09:00",
      end: "2026-09-14T17:00:00+09:00",
    });
    expect(
      events.find((event) => event.location === "大阪市住之江区")?.when,
    ).toStrictEqual({
      kind: "allDay",
      startDate: "2026-09-21",
      endDate: "2026-09-23",
    });
  });

  test("手配対象外の予定には場所を持たせない", () => {
    const events = seedCalendarEvents(NOW);

    expect(events.find((event) => event.id === "seed-1")?.location).toBe(
      undefined,
    );
  });
});

describe("createFakeCalendar", () => {
  test("範囲に重なる予定だけを開始順で返す", async () => {
    const calendar = createFakeCalendar({ events: scanned, newEventId });

    const result = await calendar.listEvents(window);

    expect(result.ok && idsOf(result.value)).toStrictEqual([
      "spans",
      "all-day",
      "meeting",
    ]);
  });

  test("範囲の開始で終わる予定と終わりに始まる予定は外す", async () => {
    const calendar = createFakeCalendar({ events: scanned, newEventId });

    const result = await calendar.listEvents(window);

    expect(result.ok && idsOf(result.value)).not.toContain("ends-at-from");
    expect(result.ok && idsOf(result.value)).not.toContain("starts-at-to");
  });

  test("getEvent は id が一致する予定を返し、無ければ undefined になる", async () => {
    const calendar = createFakeCalendar({ events: scanned, newEventId });

    expect(await calendar.getEvent(eventId("meeting"))).toStrictEqual({
      ok: true,
      value: scanned[0],
    });
    expect(await calendar.getEvent(eventId("unknown"))).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("insertEvent した予定は listEvents と getEvent から見える", async () => {
    const calendar = createFakeCalendar({ events: [], newEventId });
    const draft = {
      title: "大阪出張の移動",
      when: {
        kind: "timed",
        start: mustParse(parseIsoDateTime("2026-09-14T09:00:00+09:00")),
        end: mustParse(parseIsoDateTime("2026-09-14T11:30:00+09:00")),
      },
      location: "東京",
    } as const;

    const inserted = await calendar.insertEvent(draft);

    expect(inserted).toStrictEqual({
      ok: true,
      value: { ...draft, id: "inserted-1" },
    });
    expect(await calendar.getEvent(eventId("inserted-1"))).toStrictEqual({
      ok: true,
      value: { ...draft, id: "inserted-1" },
    });
    expect(await calendar.listEvents(window)).toStrictEqual({
      ok: true,
      value: [{ ...draft, id: "inserted-1" }],
    });
  });
});
