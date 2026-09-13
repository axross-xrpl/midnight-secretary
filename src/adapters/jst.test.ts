import { describe, expect, test } from "vitest";
import type { IsoDate } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import { jstDateOf, jstDateTimeOf } from "./jst";

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
