"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { MandateResponse } from "@/lib/secretary-response";
import type { FormatNumber } from "./format";
import { moneyText, remainingOf, shortHash } from "./format";
import {
  faintLabelClass,
  labelClass,
  privatePillClass,
  publicPillClass,
  sectionLabelClass,
} from "./styles";
import type { PublicLedgerView } from "./types";

type Props = {
  publicLedger: PublicLedgerView;
  mandate?: MandateResponse;
};

const sideCardClass =
  "flex flex-col gap-3.5 rounded-xl border-2 bg-surface p-3.5 px-4";
const hashClass = "font-mono text-[10.5px] text-accent";

const PublicSide = ({
  publicLedger,
}: {
  publicLedger: PublicLedgerView;
}): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <div className={`${sideCardClass} border-public`}>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span className={publicPillClass}>{t("public.eyebrow")}</span>
        </span>
        <h3 className="text-[13px] font-bold">{t("public.title")}</h3>
        <p className={labelClass}>{t("public.who")}</p>
      </div>

      <dl className="flex flex-col gap-2.5 text-[12.5px]">
        <div>
          <dt className={faintLabelClass}>{t("public.commitments")}</dt>
          <dd className="flex flex-col gap-0.5">
            {publicLedger.commitments.length === 0 ? (
              <span className="text-muted">{t("public.none")}</span>
            ) : (
              publicLedger.commitments.map((entry) => (
                <span
                  key={entry.mandateId}
                  className={hashClass}
                  title={entry.commitment}
                >
                  {shortHash(entry.commitment)}
                </span>
              ))
            )}
          </dd>
        </div>
        <div>
          <dt className={faintLabelClass}>{t("public.authorizations")}</dt>
          <dd className="flex flex-col gap-0.5">
            {publicLedger.authorizations.length === 0 ? (
              <span className="text-muted">{t("public.none")}</span>
            ) : (
              publicLedger.authorizations.map((entry) => (
                <span
                  key={entry.publicHash}
                  className={hashClass}
                  title={entry.publicHash}
                >
                  {shortHash(entry.publicHash)}
                </span>
              ))
            )}
          </dd>
        </div>
        <div>
          <dt className={faintLabelClass}>{t("public.count")}</dt>
          <dd className="text-base font-bold tabular-nums">
            {publicLedger.authorizedCount}
          </dd>
        </div>
      </dl>

      <p className="text-[10.5px] leading-relaxed text-faint">
        {t("public.note")}
      </p>
    </div>
  );
};

const MandateFacts = ({
  mandate,
}: {
  mandate: MandateResponse;
}): ReactElement => {
  const t = useTranslations("LedgerPanel");
  const format = useFormatter();
  const formatNumber: FormatNumber = (amount) => {
    return format.number(amount);
  };

  return (
    <dl className="grid gap-2.5 text-[12.5px] [grid-template-columns:repeat(auto-fit,minmax(8rem,1fr))]">
      <div>
        <dt className={faintLabelClass}>{t("private.cap")}</dt>
        <dd className="font-bold tabular-nums">
          {moneyText(mandate.cap, formatNumber)}
        </dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.spent")}</dt>
        <dd className="font-bold tabular-nums">
          {moneyText(mandate.spent, formatNumber)}
        </dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.remaining")}</dt>
        <dd className="font-bold tabular-nums">
          {moneyText(remainingOf(mandate), formatNumber)}
        </dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.expires")}</dt>
        <dd className="font-medium">
          {format.dateTime(new Date(mandate.expiresAt), {
            dateStyle: "medium",
          })}
        </dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.purpose")}</dt>
        <dd className="font-medium">{mandate.purpose}</dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.commitment")}</dt>
        <dd className={hashClass} title={mandate.commitment}>
          {shortHash(mandate.commitment)}
        </dd>
      </div>
    </dl>
  );
};

const PrivateSide = ({
  mandate,
}: {
  mandate?: MandateResponse;
}): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <div className={`${sideCardClass} border-private`}>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span className={privatePillClass}>{t("private.eyebrow")}</span>
        </span>
        <h3 className="text-[13px] font-bold">{t("private.title")}</h3>
        <p className={labelClass}>{t("private.who")}</p>
      </div>

      {mandate === undefined ? (
        <p className="text-[12.5px] text-muted">{t("private.none")}</p>
      ) : (
        <MandateFacts mandate={mandate} />
      )}

      <p className="text-[10.5px] leading-relaxed text-faint">
        {t("private.note")}
      </p>
    </div>
  );
};

/**
 * 同じ支払い枠について、公開台帳に載るものと非公開のまま残るものを並べて見せる
 */
export const LedgerPanel = ({ publicLedger, mandate }: Props): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 className={sectionLabelClass}>{t("title")}</h2>
        <p className={labelClass}>{t("subtitle")}</p>
      </div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
        <PublicSide publicLedger={publicLedger} />
        <PrivateSide mandate={mandate} />
      </div>
    </section>
  );
};
