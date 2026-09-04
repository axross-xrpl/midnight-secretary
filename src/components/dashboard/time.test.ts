import { describe, expect, test } from "vitest";
import { addDays, atHour, isPast } from "./time";

describe("time helpers", () => {
  test("addDays moves forward and backward by whole days", () => {
    expect(addDays("2026-09-04T00:00:00.000Z", 3)).toBe(
      "2026-09-07T00:00:00.000Z",
    );
    expect(addDays("2026-09-04T12:30:00.000Z", -1)).toBe(
      "2026-09-03T12:30:00.000Z",
    );
  });

  test("atHour keeps the UTC date and sets the hour", () => {
    expect(atHour("2026-09-04T12:30:45.000Z", 4)).toBe(
      "2026-09-04T04:00:00.000Z",
    );
  });

  test("isPast is inclusive of the deadline", () => {
    expect(isPast("2026-09-04T00:00:00.000Z", "2026-09-04T00:00:00.000Z")).toBe(
      true,
    );
    expect(isPast("2026-09-04T00:00:00.000Z", "2026-09-03T23:59:59.000Z")).toBe(
      false,
    );
  });
});
