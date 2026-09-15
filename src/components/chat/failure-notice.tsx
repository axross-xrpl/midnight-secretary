"use client";

import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { match } from "ts-pattern";
import { Link } from "@/i18n/navigation";
import { failureMessageOf } from "./failure-message";
import { moneyText } from "./format";
import { dangerBoxClass } from "./styles";
import type { RequestFailure } from "./types";
import { useFormatNumber } from "./use-format-number";

type FailureNoticeProps = {
  failure: RequestFailure;
};

// 証明書の発行はプロフィール設定の 1 手なので、文言の中からそこへ導く
const settingsLink = (chunks: ReactNode): ReactElement => {
  return (
    <Link href="/settings/profile" className="underline">
      {chunks}
    </Link>
  );
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
  const formatNumber = useFormatNumber();
  const text = match(failureMessageOf(failure))
    .returnType<ReactNode>()
    .with({ kind: "plain" }, ({ key }) => t(key))
    .with({ kind: "ageCredentialMissing" }, () =>
      t.rich("flow.ageCredentialMissing", { link: settingsLink }),
    )
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
