import type { Result } from "@/lib/result";
import { andThen, err, ok } from "@/lib/result";
import type { Amount } from "./identifiers";
import { mustParse, parseAmount } from "./identifiers.parse";

/**
 * Wave 1 で扱う通貨
 *
 * 支払いはデモ用トークン 1 本で行い、mandate の上限も料金表もこのトークン建て (1 トークン = 1 円相当、小数点以下 0 桁)
 * トークンは contract/src/token.compact で発行し、シンボルは deploy 時の引数で決めるので、ここでは仮に DEMO と呼ぶ
 * NIGHT は Midnight のネイティブトークン (小数点以下 6 桁) で、Wave 1 では支払いに使わないが手数料などで現れうる
 * 異なる通貨の金額を混ぜて計算しないよう、Money は通貨を持ち続ける
 */
export type Currency = "DEMO" | "NIGHT";

/**
 * 通貨の最小単位で表した金額
 */
export type Money = {
  amount: Amount;
  currency: Currency;
};

/**
 * 金額の演算で起こりうる失敗
 */
export type MoneyError =
  | { kind: "currencyMismatch"; expected: Currency; actual: Currency }
  | { kind: "negativeResult"; left: Money; right: Money };

/**
 * 三値比較の結果
 */
export type Ordering = -1 | 0 | 1;

const currencyMismatch = (a: Money, b: Money): MoneyError => {
  return {
    kind: "currencyMismatch",
    expected: a.currency,
    actual: b.currency,
  };
};

// 両辺は非負の safe integer なので、和や差が parse に失敗するのはバグ
const amountOf = (raw: number): Amount => {
  return mustParse(parseAmount(raw));
};

/**
 * 同じ通貨の金額 2 つを足す
 */
export const addMoney = (a: Money, b: Money): Result<Money, MoneyError> => {
  if (a.currency !== b.currency) {
    return err(currencyMismatch(a, b));
  }

  return ok({ amount: amountOf(a.amount + b.amount), currency: a.currency });
};

/**
 * a から b を引く
 *
 * 結果が負になるときは失敗する
 */
export const subtractMoney = (
  a: Money,
  b: Money,
): Result<Money, MoneyError> => {
  if (a.currency !== b.currency) {
    return err(currencyMismatch(a, b));
  }

  if (a.amount < b.amount) {
    return err({ kind: "negativeResult", left: a, right: b });
  }

  return ok({ amount: amountOf(a.amount - b.amount), currency: a.currency });
};

/**
 * 同じ通貨の金額の空でない一覧を合計する
 */
export const sumMoney = (
  items: readonly [Money, ...Money[]],
): Result<Money, MoneyError> => {
  return items
    .slice(1)
    .reduce<Result<Money, MoneyError>>(
      (total, item) => andThen(total, (sum) => addMoney(sum, item)),
      ok(items[0]),
    );
};

/**
 * 同じ通貨の金額 2 つを比較する
 */
export const compareMoney = (
  a: Money,
  b: Money,
): Result<Ordering, MoneyError> => {
  if (a.currency !== b.currency) {
    return err(currencyMismatch(a, b));
  }

  if (a.amount < b.amount) {
    return ok(-1);
  }

  if (a.amount > b.amount) {
    return ok(1);
  }

  return ok(0);
};
