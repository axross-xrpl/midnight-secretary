"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { MandateResponse } from "@/lib/secretary-response";
import type { FormatNumber } from "./format";
import { moneyText, remainingOf, usedPercent } from "./format";
import {
  cardClass,
  faintLabelClass,
  labelClass,
  privatePillClass,
} from "./styles";

type Props = {
  mandate: MandateResponse;
};

/**
 * 非公開データとして持っている支払い枠 (残り、上限、使用済み、期限、用途)
 *
 * 参考実装のウォレットカードと同じ並び
 */
export const MandateCard = ({ mandate }: Props): ReactElement => {
  const t = useTranslations("MandateCard");
  const format = useFormatter();
  const formatNumber: FormatNumber = (amount) => {
    return format.number(amount);
  };
  const percent = usedPercent(mandate);

  return (
    <section className={`${cardClass} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-private text-xl font-bold text-white"
          aria-hidden="true"
        >
          {t("initial")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs text-muted">{t("title")}</h2>
            <span className={privatePillClass}>{t("badge")}</span>
          </div>
          <div className="text-2xl font-bold leading-snug tabular-nums">
            {moneyText(remainingOf(mandate), formatNumber)}{" "}
            <span className="text-[13px] font-semibold text-muted">
              {t("remaining")}
            </span>
          </div>
        </div>
      </div>

      <dl className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(7rem,1fr))]">
        <div className="rounded-xl border border-border p-3 px-3.5">
          <dt className={labelClass}>{t("cap")}</dt>
          <dd className="text-base font-bold tabular-nums">
            {moneyText(mandate.cap, formatNumber)}
          </dd>
        </div>
        <div className="rounded-xl border border-border p-3 px-3.5">
          <dt className={labelClass}>{t("spent")}</dt>
          <dd className="text-base font-bold tabular-nums">
            {moneyText(mandate.spent, formatNumber)}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-[5px]">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-neutral-bg"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-private"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className={faintLabelClass}>{t("usedPercent", { percent })}</span>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
        <div className="flex items-baseline gap-1.5">
          <dt className={labelClass}>{t("purpose")}</dt>
          <dd className="font-medium">{mandate.purpose}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className={labelClass}>{t("expires")}</dt>
          <dd className="font-medium">
            {format.dateTime(new Date(mandate.expiresAt), {
              dateStyle: "medium",
            })}
          </dd>
        </div>
      </dl>
    </section>
  );
};
