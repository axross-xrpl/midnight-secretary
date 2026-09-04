"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { remainingAllowance, shortHash } from "./flow";
import {
  cardClass,
  labelClass,
  moneyFormatOptions,
  privateAccentClass,
  publicAccentClass,
} from "./styles";
import type { MandateView, PublicLedgerView } from "./types";

type Props = {
  ledger: PublicLedgerView;
  mandate: MandateView;
};

const PublicSide = ({ ledger }: { ledger: PublicLedgerView }): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <div className={`${cardClass} ${publicAccentClass} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {t("public.eyebrow")}
        </span>
        <h3 className="text-base font-semibold">{t("public.title")}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("public.who")}
        </p>
      </div>

      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className={labelClass}>{t("public.commitments")}</dt>
          <dd className="flex flex-col gap-1 font-mono">
            {ledger.commitments.map((entry) => (
              <span key={entry.mandateId} title={entry.commitment}>
                {shortHash(entry.commitment)}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>{t("public.authorizations")}</dt>
          <dd className="flex flex-col gap-1 font-mono">
            {ledger.authorizationHashes.length === 0 ? (
              <span className="font-sans text-zinc-500">
                {t("public.none")}
              </span>
            ) : (
              ledger.authorizationHashes.map((hash) => (
                <span key={hash} title={hash}>
                  {shortHash(hash)}
                </span>
              ))
            )}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>{t("public.count")}</dt>
          <dd className="tabular-nums">{ledger.authorizedCount}</dd>
        </div>
      </dl>

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        {t("public.note")}
      </p>
    </div>
  );
};

const PrivateSide = ({ mandate }: { mandate: MandateView }): ReactElement => {
  const t = useTranslations("LedgerPanel");
  const format = useFormatter();
  const money = (amount: number): string => {
    return format.number(amount, moneyFormatOptions(mandate.cap.currency));
  };

  return (
    <div className={`${cardClass} ${privateAccentClass} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-400">
          {t("private.eyebrow")}
        </span>
        <h3 className="text-base font-semibold">{t("private.title")}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("private.who")}
        </p>
      </div>

      <dl className="grid gap-3 text-sm [grid-template-columns:repeat(auto-fit,minmax(8rem,1fr))]">
        <div>
          <dt className={labelClass}>{t("private.cap")}</dt>
          <dd className="tabular-nums">{money(mandate.cap.amount)}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("private.spent")}</dt>
          <dd className="tabular-nums">{money(mandate.spent.amount)}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("private.remaining")}</dt>
          <dd className="tabular-nums">
            {money(remainingAllowance(mandate).amount)}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>{t("private.expires")}</dt>
          <dd>
            {format.dateTime(new Date(mandate.expiresAt), {
              dateStyle: "medium",
            })}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>{t("private.purpose")}</dt>
          <dd>{mandate.purpose}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("private.commitment")}</dt>
          <dd className="font-mono" title={mandate.commitment}>
            {shortHash(mandate.commitment)}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        {t("private.note")}
      </p>
    </div>
  );
};

/**
 * Side-by-side view of what the public ledger shows and what stays in
 * private state, for the same mandate.
 */
export const LedgerPanel = ({ ledger, mandate }: Props): ReactElement => {
  const t = useTranslations("LedgerPanel");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("subtitle")}
        </p>
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
        <PublicSide ledger={ledger} />
        <PrivateSide mandate={mandate} />
      </div>
    </section>
  );
};
