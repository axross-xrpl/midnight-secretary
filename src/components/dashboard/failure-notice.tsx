"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import { failureMessageOf } from "./failure-message";
import type { FormatNumber } from "./format";
import { moneyText } from "./format";
import { dangerBoxClass } from "./styles";
import type { RequestFailure } from "./types";

type Props = {
  failure: RequestFailure;
};

/**
 * 失敗を 1 行で出す
 *
 * ステッパー、支払い枠のフォーム、ページの読み込み失敗が共通で使う
 * `SecretaryError` 名前空間の `t` を呼ぶのはここだけ
 */
export const FailureNotice = ({ failure }: Props): ReactElement => {
  const t = useTranslations("SecretaryError");
  const format = useFormatter();
  const formatNumber: FormatNumber = (amount) => {
    return format.number(amount);
  };
  const text = match(failureMessageOf(failure))
    .with({ kind: "plain" }, ({ key }) => t(key))
    .with({ kind: "planOverBudget" }, ({ budget, total }) =>
      t("plan.overBudget", {
        budget: moneyText(budget, formatNumber),
        total: moneyText(total, formatNumber),
      }),
    )
    .with({ kind: "mandateOverBudget" }, ({ cap, spent, requested }) =>
      t("mandate.overBudget", {
        cap: moneyText(cap, formatNumber),
        spent: moneyText(spent, formatNumber),
        requested: moneyText(requested, formatNumber),
      }),
    )
    .exhaustive();

  return (
    <p className={dangerBoxClass} role="alert">
      {text}
    </p>
  );
};
