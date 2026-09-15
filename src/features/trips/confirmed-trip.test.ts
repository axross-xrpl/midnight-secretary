import { describe, expect, test } from "vitest";
import type { ConfirmedTripItem } from "./confirmed-trip";
import { totalJpycOf } from "./confirmed-trip";

const item = (
  overrides: Partial<ConfirmedTripItem> & Pick<ConfirmedTripItem, "id">,
): ConfirmedTripItem => {
  return {
    seq: 1,
    category: "hotel",
    name: "ホテルB 大阪梅田",
    unitPriceJpyc: 16000,
    quantity: 1,
    priceJpyc: 16000,
    startAt: null,
    endAt: null,
    status: "booked",
    bookingRef: null,
    ...overrides,
  };
};

describe("totalJpycOf", () => {
  test("明細の確定額を足す", () => {
    expect(
      totalJpycOf([
        item({ id: "1", priceJpyc: 14520 }),
        item({ id: "2", priceJpyc: 16000 }),
      ]),
    ).toBe(30520);
  });

  test("取り消した明細は数えない", () => {
    expect(
      totalJpycOf([
        item({ id: "1", priceJpyc: 14520 }),
        item({ id: "2", priceJpyc: 16000, status: "cancelled" }),
      ]),
    ).toBe(14520);
  });

  test("明細が無ければ 0", () => {
    expect(totalJpycOf([])).toBe(0);
  });
});
