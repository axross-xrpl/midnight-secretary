"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { MandateResponse } from "@/lib/secretary-response";
import {
  LOCAL_DATE_OPTIONS,
  moneyText,
  plainSpaces,
  remainingOf,
  usedPercent,
} from "./format";
import {
  cardClass,
  faintLabelClass,
  labelClass,
  privatePillClass,
} from "./styles";
import { useFormatNumber } from "./use-format-number";

type MandateCardProps = {
  mandate: MandateResponse;
};

/**
 * 非公開データとして持っている支払い枠 (残り、上限、使用済み、期限、用途)
 *
 * 参考実装のウォレットカードと同じ並び
 */
export const MandateCard = ({ mandate }: MandateCardProps): ReactElement => {
  const t = useTranslations("MandateCard");
  const format = useFormatter();
  const formatNumber = useFormatNumber();
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
            <h2 className="text-sm text-muted">{t("title")}</h2>
            <span className={privatePillClass}>{t("badge")}</span>
          </div>
          {/* 「残り」は金額の下の行に置く (サイドバーの幅では横に並べると途中で折り返す) */}
          <div className="text-2xl font-semibold tabular-nums">
            {moneyText(remainingOf(mandate), formatNumber)}
            <span className="block text-sm font-medium text-muted">
              {t("remaining")}
            </span>
          </div>
        </div>
      </div>

      <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className={labelClass}>{t("cap")}</dt>
          <dd className="text-base font-semibold tabular-nums">
            {moneyText(mandate.cap, formatNumber)}
          </dd>
        </div>
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className={labelClass}>{t("spent")}</dt>
          <dd className="text-base font-semibold tabular-nums">
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

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className={labelClass}>{t("purpose")}</dt>
          <dd className="font-medium">{mandate.purpose}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className={labelClass}>{t("expires")}</dt>
          <dd className="font-medium">
            {plainSpaces(
              format.dateTime(new Date(mandate.expiresAt), LOCAL_DATE_OPTIONS),
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
};
