import { describe, expect, test } from "vitest";
import { addDays, nightsBetween } from "./dates";
import type { IsoDate } from "./identifiers";
import { mustParse, parseIsoDate } from "./identifiers.parse";

const date = (raw: string): IsoDate => {
  return mustParse(parseIsoDate(raw));
};

describe("addDays", () => {
  test("月をまたいで進む", () => {
    expect(addDays(date("2026-09-30"), 1)).toBe("2026-10-01");
  });

  test("月をまたいで戻る", () => {
    expect(addDays(date("2026-03-01"), -1)).toBe("2026-02-28");
  });

  test("年をまたいで進む", () => {
    expect(addDays(date("2026-12-31"), 1)).toBe("2027-01-01");
  });

  test("0 日なら同じ日付になる", () => {
    expect(addDays(date("2026-09-10"), 0)).toBe("2026-09-10");
  });
});

describe("nightsBetween", () => {
  test("泊数を数える", () => {
    expect(nightsBetween(date("2026-09-10"), date("2026-09-12"))).toBe(2);
  });

  test("日帰りは 0 泊になる", () => {
    expect(nightsBetween(date("2026-09-10"), date("2026-09-10"))).toBe(0);
  });

  test("月をまたいでも数えられる", () => {
    expect(nightsBetween(date("2026-09-30"), date("2026-10-02"))).toBe(2);
  });
});
