import { describe, expect, expectTypeOf, it } from "vitest";
import { filterMap, isDefined } from "./array";

const parsePositive = (input: number): number | undefined => {
  if (input > 0) {
    return input;
  }

  return undefined;
};

describe("filterMap", () => {
  it("正常系: 変換に成功した値だけを集める", () => {
    const result = filterMap([1, -2, 3], parsePositive);

    expect(result).toStrictEqual([1, 3]);
  });

  it("境界値: 空配列は空配列を返す", () => {
    const result = filterMap([], parsePositive);

    expect(result).toStrictEqual([]);
  });
});

describe("isDefined", () => {
  it("正常系: filter に渡すと undefined を除去して型が絞り込まれる", () => {
    const items: (string | undefined)[] = ["a", undefined, "b"];
    const result = items.filter(isDefined);

    expect(result).toStrictEqual(["a", "b"]);
    expectTypeOf(result).toEqualTypeOf<string[]>();
  });
});
