import { describe, expect, test } from "vitest";
import type { IsoDate } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import { addDays, jstDateOf, jstDateTimeOf, nightsBetween } from "./jst";

const date = (raw: string): IsoDate => {
  return mustParse(parseIsoDate(raw));
};

describe("jstDateOf", () => {
  test("JST の日付を取り出す", () => {
    expect(
      jstDateOf(mustParse(parseIsoDateTime("2026-09-10T10:00:00+09:00"))),
    ).toBe("2026-09-10");
  });

  test("UTC の夕方は JST では翌日になる", () => {
    expect(jstDateOf(mustParse(parseIsoDateTime("2026-09-09T16:00:00Z")))).toBe(
      "2026-09-10",
    );
  });
});

describe("jstDateTimeOf", () => {
  test("日付と時刻を JST の日時にする", () => {
    expect(jstDateTimeOf(date("2026-09-10"), "10:00")).toBe(
      "2026-09-10T10:00:00+09:00",
    );
  });

  test("作った日時から同じ日付に戻る", () => {
    expect(jstDateOf(jstDateTimeOf(date("2026-09-10"), "23:30"))).toBe(
      "2026-09-10",
    );
  });
});

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
