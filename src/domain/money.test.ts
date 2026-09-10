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

const demo = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "DEMO" };
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
    expect(addMoney(demo(14720), demo(12000))).toStrictEqual({
      ok: true,
      value: demo(26720),
    });
  });

  test("通貨が違えば currencyMismatch になる", () => {
    expect(addMoney(demo(100), night(100))).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "DEMO", actual: "NIGHT" },
    });
  });
});

describe("subtractMoney", () => {
  test("同じ通貨どうしを引く", () => {
    expect(subtractMoney(demo(50000), demo(14720))).toStrictEqual({
      ok: true,
      value: demo(35280),
    });
  });

  test("結果が負になるなら negativeResult になる", () => {
    expect(subtractMoney(demo(100), demo(101))).toStrictEqual({
      ok: false,
      error: { kind: "negativeResult", left: demo(100), right: demo(101) },
    });
  });

  test("通貨が違えば currencyMismatch になる", () => {
    expect(subtractMoney(night(100), demo(1))).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "NIGHT", actual: "DEMO" },
    });
  });
});

describe("sumMoney", () => {
  test("同じ通貨の一覧を畳む", () => {
    expect(sumMoney([demo(14720), demo(14720), demo(12000)])).toStrictEqual({
      ok: true,
      value: demo(41440),
    });
  });

  test("1 件ならその値をそのまま返す", () => {
    expect(sumMoney([demo(14720)])).toStrictEqual({
      ok: true,
      value: demo(14720),
    });
  });

  test("途中で通貨が違えば最初の失敗を返す", () => {
    expect(sumMoney([demo(100), night(100), demo(200)])).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "DEMO", actual: "NIGHT" },
    });
  });
});

describe("compareMoney", () => {
  test("小さい / 等しい / 大きいで 3 値を返す", () => {
    expect(compareMoney(demo(1), demo(2))).toStrictEqual({
      ok: true,
      value: -1,
    });
    expect(compareMoney(demo(2), demo(2))).toStrictEqual({
      ok: true,
      value: 0,
    });
    expect(compareMoney(demo(3), demo(2))).toStrictEqual({
      ok: true,
      value: 1,
    });
  });

  test("通貨が違えば currencyMismatch になる", () => {
    expect(compareMoney(demo(1), night(1))).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "DEMO", actual: "NIGHT" },
    });
  });
});

describe("remainingAllowance", () => {
  test("cap から spent を引いた残額を返す", () => {
    expect(
      remainingAllowance(mandateWith(demo(50000), demo(12000))),
    ).toStrictEqual({ ok: true, value: demo(38000) });
  });

  test("使い切っていれば 0 になる", () => {
    expect(
      remainingAllowance(mandateWith(demo(50000), demo(50000))),
    ).toStrictEqual({ ok: true, value: demo(0) });
  });
});
