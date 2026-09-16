import { describe, expect, test } from "vitest";
import { isDefined } from "@/lib/array";
import type { LandingCalendarEvent } from "./landing-calendar";
import { buildLandingCalendarCells } from "./landing-calendar";

const cells = buildLandingCalendarCells();

// index % 7 が columns のいずれかに入るマスの予定だけを集める
const eventsOnColumns = (
  columns: readonly number[],
): LandingCalendarEvent[] => {
  return cells
    .filter((_, index) => columns.includes(index % 7))
    .map((cell) => cell.event)
    .filter(isDefined);
};

describe("buildLandingCalendarCells", () => {
  test("35 マスある", () => {
    expect(cells).toHaveLength(35);
  });

  test("8/31 から 10/4 までを並べる", () => {
    expect(cells[0]).toStrictEqual({ day: 31, outsideMonth: true });
    expect(cells[1].day).toStrictEqual(1);
    expect(cells[30].day).toStrictEqual(30);
    // index 31 は 10/1 で 2 本目の出張の 1 日目なので予定も持つ
    expect(cells[31]).toStrictEqual({
      day: 1,
      outsideMonth: true,
      event: { kind: "trip", label: "Osaka trip" },
    });
    expect(cells[34].day).toStrictEqual(4);
  });

  test("木曜の列には出張の 1 日目しか置かない", () => {
    const kinds = eventsOnColumns([3]).map((event) => event.kind);

    expect(kinds).toStrictEqual(["trip", "trip"]);
  });

  test("土日の列には予定を置かない", () => {
    expect(eventsOnColumns([5, 6])).toStrictEqual([]);
  });

  test("出張の 1 日目の次のマスは帯の続きになる", () => {
    const kindsAfterTrip = cells
      .map((cell, index) => ({
        kind: cell.event?.kind,
        nextKind: cells[index + 1]?.event?.kind,
      }))
      .filter((pair) => pair.kind === "trip")
      .map((pair) => pair.nextKind);

    expect(kindsAfterTrip).toStrictEqual(["tripContinued", "tripContinued"]);
  });
});
