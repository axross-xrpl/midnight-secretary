"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { remainingAllowance } from "./flow";
import {
  cardClass,
  labelClass,
  moneyFormatOptions,
  privateAccentClass,
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
 * The user's spending mandate as held in private state: cap, spent,
 * remaining, expiry, and purpose.
 */
export const MandateCard = ({ mandate }: Props): ReactElement => {
  const t = useTranslations("MandateCard");
  const format = useFormatter();
  const remaining = remainingAllowance(mandate);
  const money = (amount: number): string => {
    return format.number(amount, moneyFormatOptions(mandate.cap.currency));
  };

  return (
    <section
      className={`${cardClass} ${privateAccentClass} flex flex-col gap-4`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
          {t("badge")}
        </span>
      </div>

      <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(7rem,1fr))]">
        <div>
          <dt className={labelClass}>{t("remaining")}</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {money(remaining.amount)}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>{t("cap")}</dt>
          <dd className="text-lg tabular-nums">{money(mandate.cap.amount)}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("spent")}</dt>
          <dd className="text-lg tabular-nums">
            {money(mandate.spent.amount)}
          </dd>
        </div>
      </dl>

      <div
        className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-violet-500"
          style={{ width: `${usedPercent(mandate)}%` }}
        />
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className={labelClass}>{t("purpose")}</dt>
          <dd>{mandate.purpose}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("expires")}</dt>
          <dd>
            {format.dateTime(new Date(mandate.expiresAt), {
              dateStyle: "medium",
            })}
          </dd>
        </div>
      </dl>
    </section>
  );
};
