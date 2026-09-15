import { describe, expect, test } from "vitest";
import type { EventTime } from "@/domain/calendar";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import { datesOf } from "./event-dates";

const allDay = (startDate: string, endDate: string): EventTime => {
  return {
    kind: "allDay",
    startDate: mustParse(parseIsoDate(startDate)),
    endDate: mustParse(parseIsoDate(endDate)),
  };
};

const timed = (start: string, end: string): EventTime => {
  return {
    kind: "timed",
    start: mustParse(parseIsoDateTime(start)),
    end: mustParse(parseIsoDateTime(end)),
  };
};

describe("datesOf", () => {
  test("終日の予定は終了日の前日に帰る", () => {
    expect(datesOf(allDay("2026-09-22", "2026-09-24"))).toStrictEqual({
      departOn: "2026-09-22",
      returnOn: "2026-09-23",
    });
  });

  test("1 日だけの終日の予定は日帰り", () => {
    expect(datesOf(allDay("2026-09-22", "2026-09-23"))).toStrictEqual({
      departOn: "2026-09-22",
      returnOn: "2026-09-22",
    });
  });

  test("終了日が開始日と同じでも開始日より前には戻らない", () => {
    expect(datesOf(allDay("2026-09-22", "2026-09-22"))).toStrictEqual({
      departOn: "2026-09-22",
      returnOn: "2026-09-22",
    });
  });

  test("時刻ありの予定は JST の日付を取る", () => {
    expect(
      datesOf(timed("2026-09-14T23:30:00Z", "2026-09-15T18:00:00+09:00")),
    ).toStrictEqual({ departOn: "2026-09-15", returnOn: "2026-09-15" });
  });
});
