"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { remainingAllowance } from "./flow";
import {
  cardClass,
  faintLabelClass,
  labelClass,
  moneyFormatOptions,
  privatePillClass,
} from "./styles";
import type { MandateView } from "./types";

type Props = {
  mandate: MandateView;
};

const usedPercent = (mandate: MandateView): number => {
  if (mandate.cap.amount === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((mandate.spent.amount / mandate.cap.amount) * 100),
  );
};

/**
 * The user's spending mandate as held in private state: remaining, cap,
 * spent, expiry, and purpose. Laid out like the reference wallet card.
 */
export const MandateCard = ({ mandate }: Props): ReactElement => {
  const t = useTranslations("MandateCard");
  const format = useFormatter();
  const remaining = remainingAllowance(mandate);
  const percent = usedPercent(mandate);
  const money = (amount: number): string => {
    return format.number(amount, moneyFormatOptions(mandate.cap.currency));
  };

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
            {money(remaining.amount)}{" "}
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
            {money(mandate.cap.amount)}
          </dd>
        </div>
        <div className="rounded-xl border border-border p-3 px-3.5">
          <dt className={labelClass}>{t("spent")}</dt>
          <dd className="text-base font-bold tabular-nums">
            {money(mandate.spent.amount)}
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
