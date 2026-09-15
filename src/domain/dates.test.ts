import { describe, expect, test } from "vitest";
import { addDays, nightsBetween, yearsBefore } from "./dates";
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

describe("yearsBefore", () => {
  test("同じ月日の 20 年前になる", () => {
    expect(yearsBefore(date("2026-09-21"), 20)).toBe("2006-09-21");
  });

  test("2 月 29 日は閏年でない年では 2 月 28 日になる", () => {
    expect(yearsBefore(date("2024-02-29"), 1)).toBe("2023-02-28");
  });

  test("2 月 29 日は閏年ならそのまま", () => {
    expect(yearsBefore(date("2024-02-29"), 4)).toBe("2020-02-29");
  });

  test("年の初めと終わりでも月日は変わらず年をまたがない", () => {
    expect(yearsBefore(date("2026-01-01"), 20)).toBe("2006-01-01");
    expect(yearsBefore(date("2026-12-31"), 20)).toBe("2006-12-31");
  });

  test("0 年なら同じ日付になる", () => {
    expect(yearsBefore(date("2026-09-10"), 0)).toBe("2026-09-10");
  });
});
