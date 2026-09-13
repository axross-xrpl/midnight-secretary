"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import type { TripPlanResponse } from "@/lib/secretary-response";
import type { PlanRow } from "./format";
import {
  DATE_OPTIONS,
  moneyText,
  nightsOf,
  plainSpaces,
  planRows,
  TIMED_OPTIONS,
} from "./format";
import type { VendorKind } from "./styles";
import { labelClass, vendorMark } from "./styles";
import { useFormatNumber } from "./use-format-number";

type VendorCircleProps = {
  kind: VendorKind;
};

const VendorCircle = ({ kind }: VendorCircleProps): ReactElement => {
  return (
    <span
      className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs text-white ${vendorMark[kind].circleClass}`}
      aria-hidden="true"
    >
      {vendorMark[kind].icon}
    </span>
  );
};

type TripItemRowProps = {
  row: PlanRow;
};

const TripItemRow = ({ row }: TripItemRowProps): ReactElement => {
  const t = useTranslations("Conversation");
  const format = useFormatter();
  const formatNumber = useFormatNumber();

  return match(row)
    .with({ kind: "transport" }, ({ offer }) => (
      <li className="flex flex-wrap items-center gap-2.5 py-2">
        <VendorCircle kind={offer.mode} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">
            {t("plan.transport", {
              from: offer.origin,
              to: offer.destination,
              mode: t(`plan.modes.${offer.mode}`),
            })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {plainSpaces(
              format.dateTimeRange(
                new Date(offer.departAt),
                new Date(offer.arriveAt),
                TIMED_OPTIONS,
              ),
            )}
            {" · "}
            {offer.vendor}
          </span>
        </span>
        <span className="text-[13px] font-bold tabular-nums">
          {moneyText(offer.price, formatNumber)}
        </span>
      </li>
    ))
    .with({ kind: "lodging" }, ({ offer }) => (
      <li className="flex flex-wrap items-center gap-2.5 py-2">
        <VendorCircle kind="lodging" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">
            {t("plan.lodging", {
              hotel: offer.name,
              nights: nightsOf(offer.checkIn, offer.checkOut),
            })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {plainSpaces(
              format.dateTimeRange(
                new Date(offer.checkIn),
                new Date(offer.checkOut),
                DATE_OPTIONS,
              ),
            )}
            {" · "}
            {offer.vendor}
          </span>
        </span>
        <span className="text-[13px] font-bold tabular-nums">
          {moneyText(offer.price, formatNumber)}
        </span>
      </li>
    ))
    .exhaustive();
};

type PlanDetailsProps = {
  plan: TripPlanResponse;
};

/**
 * 計画の中身 (往路、あれば宿、復路、合計、理由)
 *
 * 提案の吹き出しの中に置く
 */
export const PlanDetails = ({ plan }: PlanDetailsProps): ReactElement => {
  const t = useTranslations("Conversation");
  const formatNumber = useFormatNumber();

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border-sub">
        {planRows(plan).map((row) => (
          <TripItemRow key={row.offer.id} row={row} />
        ))}
      </ul>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-end gap-2 border-t-2 border-divider-strong pt-2.5">
        <span className="text-xs text-muted">{t("plan.total")}</span>
        <span className="text-[19px] font-bold tabular-nums">
          {moneyText(plan.total, formatNumber)}
        </span>
      </div>
      <div className="mt-3 border-t border-dashed border-divider-strong pt-2.5">
        <div className="mb-1 text-xs font-semibold text-accent">
          {t("plan.rationale")}
        </div>
        <p className="text-[12px] leading-relaxed text-muted">
          {plan.rationale}
        </p>
      </div>
    </div>
  );
};
