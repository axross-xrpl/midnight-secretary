import { describe, expect, test } from "vitest";
import {
  mustParse,
  parseAmount,
  parseIsoDateTime,
  parseMandateId,
} from "./identifiers.parse";
import type { Mandate } from "./mandate";
import { remainingAllowance } from "./mandate";
import type { Money } from "./money";
import { addMoney, compareMoney, subtractMoney, sumMoney } from "./money";

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const night = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "NIGHT" };
};

const mandateWith = (cap: Money, spent: Money): Mandate => {
  return {
    id: mustParse(parseMandateId("mandate-1")),
    cap,
    spent,
    expiresAt: mustParse(parseIsoDateTime("2026-12-31T23:59:59+09:00")),
    purpose: "出張手配",
    commitment: "commitment-1",
  };
};

describe("addMoney", () => {
  test("同じ通貨どうしを足す", () => {
    expect(addMoney(mst(14720), mst(12000))).toStrictEqual({
      ok: true,
      value: mst(26720),
    });
  });

  test("通貨が違えば currencyMismatch になる", () => {
    expect(addMoney(mst(100), night(100))).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "MST", actual: "NIGHT" },
    });
  });
});

describe("subtractMoney", () => {
  test("同じ通貨どうしを引く", () => {
    expect(subtractMoney(mst(50000), mst(14720))).toStrictEqual({
      ok: true,
      value: mst(35280),
    });
  });

  test("結果が負になるなら negativeResult になる", () => {
    expect(subtractMoney(mst(100), mst(101))).toStrictEqual({
      ok: false,
      error: { kind: "negativeResult", left: mst(100), right: mst(101) },
    });
  });

  test("通貨が違えば currencyMismatch になる", () => {
    expect(subtractMoney(night(100), mst(1))).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "NIGHT", actual: "MST" },
    });
  });
});

describe("sumMoney", () => {
  test("同じ通貨の一覧を畳む", () => {
    expect(sumMoney([mst(14720), mst(14720), mst(12000)])).toStrictEqual({
      ok: true,
      value: mst(41440),
    });
  });

  test("1 件ならその値をそのまま返す", () => {
    expect(sumMoney([mst(14720)])).toStrictEqual({
      ok: true,
      value: mst(14720),
    });
  });

  test("途中で通貨が違えば最初の失敗を返す", () => {
    expect(sumMoney([mst(100), night(100), mst(200)])).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "MST", actual: "NIGHT" },
    });
  });
});

describe("compareMoney", () => {
  test("小さい / 等しい / 大きいで 3 値を返す", () => {
    expect(compareMoney(mst(1), mst(2))).toStrictEqual({
      ok: true,
      value: -1,
    });
    expect(compareMoney(mst(2), mst(2))).toStrictEqual({
      ok: true,
      value: 0,
    });
    expect(compareMoney(mst(3), mst(2))).toStrictEqual({
      ok: true,
      value: 1,
    });
  });

  test("通貨が違えば currencyMismatch になる", () => {
    expect(compareMoney(mst(1), night(1))).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "MST", actual: "NIGHT" },
    });
  });
});

describe("remainingAllowance", () => {
  test("cap から spent を引いた残額を返す", () => {
    expect(
      remainingAllowance(mandateWith(mst(50000), mst(12000))),
    ).toStrictEqual({ ok: true, value: mst(38000) });
  });

  test("使い切っていれば 0 になる", () => {
    expect(
      remainingAllowance(mandateWith(mst(50000), mst(50000))),
    ).toStrictEqual({ ok: true, value: mst(0) });
  });
});
