"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { MandateResponse } from "@/lib/secretary-response";
import {
  LOCAL_DATE_OPTIONS,
  moneyText,
  plainSpaces,
  remainingOf,
  shortHash,
} from "./format";
import {
  faintLabelClass,
  hashClass,
  labelClass,
  privatePillClass,
  publicPillClass,
  sidebarCardClass,
  sectionLabelClass,
} from "./styles";
import type { PublicLedgerView } from "./types";
import { useFormatNumber } from "./use-format-number";

const sideCardClass = `${sidebarCardClass} flex flex-col gap-4`;

type PublicSideProps = {
  publicLedger: PublicLedgerView;
};

const PublicSide = ({ publicLedger }: PublicSideProps): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <div className={`${sideCardClass} bg-public-bg`}>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span className={publicPillClass}>{t("public.eyebrow")}</span>
        </span>
        <h3 className="text-base font-semibold">{t("public.title")}</h3>
        <p className={labelClass}>{t("public.who")}</p>
      </div>

      <dl className="flex flex-col gap-3 text-sm">
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
          <dd className="text-base font-semibold tabular-nums">
            {publicLedger.authorizedCount}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-faint">{t("public.note")}</p>
    </div>
  );
};

type MandateFactsProps = {
  mandate: MandateResponse;
};

const MandateFacts = ({ mandate }: MandateFactsProps): ReactElement => {
  const t = useTranslations("LedgerPanel");
  const format = useFormatter();
  const formatNumber = useFormatNumber();

  return (
    <dl className="grid gap-3 text-sm [grid-template-columns:repeat(auto-fit,minmax(8rem,1fr))]">
      <div>
        <dt className={faintLabelClass}>{t("private.cap")}</dt>
        <dd className="font-semibold tabular-nums">
          {moneyText(mandate.cap, formatNumber)}
        </dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.spent")}</dt>
        <dd className="font-semibold tabular-nums">
          {moneyText(mandate.spent, formatNumber)}
        </dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.remaining")}</dt>
        <dd className="font-semibold tabular-nums">
          {moneyText(remainingOf(mandate), formatNumber)}
        </dd>
      </div>
      <div>
        <dt className={faintLabelClass}>{t("private.expires")}</dt>
        <dd className="font-medium">
          {plainSpaces(
            format.dateTime(new Date(mandate.expiresAt), LOCAL_DATE_OPTIONS),
          )}
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

type PrivateSideProps = {
  mandate?: MandateResponse;
};

const PrivateSide = ({ mandate }: PrivateSideProps): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <div className={`${sideCardClass} bg-private-bg`}>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span className={privatePillClass}>{t("private.eyebrow")}</span>
        </span>
        <h3 className="text-base font-semibold">{t("private.title")}</h3>
        <p className={labelClass}>{t("private.who")}</p>
      </div>

      {mandate === undefined ? (
        <p className="text-sm text-muted">{t("private.none")}</p>
      ) : (
        <MandateFacts mandate={mandate} />
      )}

      <p className="text-xs text-faint">{t("private.note")}</p>
    </div>
  );
};

type LedgerPanelProps = {
  publicLedger: PublicLedgerView;
  mandate?: MandateResponse;
};

/**
 * 同じ支払い枠について、公開台帳に載るものと非公開のまま残るものを並べて見せる
 */
export const LedgerPanel = ({
  publicLedger,
  mandate,
}: LedgerPanelProps): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className={sectionLabelClass}>{t("title")}</h2>
        <p className={labelClass}>{t("subtitle")}</p>
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
        <PublicSide publicLedger={publicLedger} />
        <PrivateSide mandate={mandate} />
      </div>
    </section>
  );
};
