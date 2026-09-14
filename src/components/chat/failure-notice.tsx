"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import { failureMessageOf } from "./failure-message";
import { asOfDateOf, DATE_OPTIONS, moneyText, plainSpaces } from "./format";
import { dangerBoxClass } from "./styles";
import type { RequestFailure } from "./types";
import { useFormatNumber } from "./use-format-number";

type FailureNoticeProps = {
  failure: RequestFailure;
};

/**
 * 失敗を 1 行で出す
 *
 * 秘書の失敗の吹き出しと、ページの読み込み失敗の表示が共通で使う
 * `SecretaryError` 名前空間の `t` を呼ぶのはここだけ
 */
export const FailureNotice = ({
  failure,
}: FailureNoticeProps): ReactElement => {
  const t = useTranslations("SecretaryError");
  const format = useFormatter();
  const formatNumber = useFormatNumber();
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
    .with({ kind: "ageNotVerified" }, ({ ageLimit, cutoffDate }) =>
      t("flow.ageNotVerified", {
        date: plainSpaces(
          format.dateTime(
            new Date(asOfDateOf(cutoffDate, ageLimit)),
            DATE_OPTIONS,
          ),
        ),
        age: ageLimit,
      }),
    )
    .exhaustive();

  return (
    <p className={dangerBoxClass} role="alert">
      {text}
    </p>
  );
};
