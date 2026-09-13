"use client";

import { useFormatter } from "next-intl";
import type { FormatNumber } from "./format";

/**
 * 現在のロケールで整数を桁区切りにする関数を返す hook
 *
 * `moneyText` に渡す `FormatNumber` を各コンポーネントで組み立てなくて済むよう next-intl の `useFormatter().number` を包む
 */
export const useFormatNumber = (): FormatNumber => {
  const format = useFormatter();

  return (amount) => {
    return format.number(amount);
  };
};
