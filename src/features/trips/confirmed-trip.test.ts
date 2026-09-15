import { describe, expect, test } from "vitest";
import type { ConfirmedTripItem } from "./confirmed-trip";
import { totalPriceOf } from "./confirmed-trip";

const item = (
  overrides: Partial<ConfirmedTripItem> & Pick<ConfirmedTripItem, "id">,
): ConfirmedTripItem => {
  return {
    seq: 1,
    category: "hotel",
    name: "ホテルB 大阪梅田",
    unitPrice: 16000,
    quantity: 1,
    price: 16000,
    startAt: null,
    endAt: null,
    status: "booked",
    bookingRef: null,
    ...overrides,
  };
};

describe("totalPriceOf", () => {
  test("明細の確定額を足す", () => {
    expect(
      totalPriceOf([
        item({ id: "1", price: 14520 }),
        item({ id: "2", price: 16000 }),
      ]),
    ).toBe(30520);
  });

  test("取り消した明細は数えない", () => {
    expect(
      totalPriceOf([
        item({ id: "1", price: 14520 }),
        item({ id: "2", price: 16000, status: "cancelled" }),
      ]),
    ).toBe(14520);
  });

  test("明細が無ければ 0", () => {
    expect(totalPriceOf([])).toBe(0);
  });
});
