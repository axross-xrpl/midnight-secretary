"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Priority } from "@/features/profile/constants";
import { verificationReadiness } from "@/features/profile/readiness";

const priceFormatter = new Intl.NumberFormat();

type ProfileReadinessProps = {
  birthDate: string;
  residencePref: string;
  homeCity: string;
  homeSpot: string;
  budget: string;
  priority: Priority | "";
  walletAddress: string;
};

/**
 * 入力した内容が手配にどう効くかを出す
 *
 * 述語の元になる列が空だと、その確認を要求するサービスが候補から外れるため、
 * 保存前でも充足状況が見えるように入力中の値で判定する
 */
export function ProfileReadiness({
  birthDate,
  residencePref,
  homeCity,
  homeSpot,
  budget,
  priority,
  walletAddress,
}: ProfileReadinessProps) {
  const t = useTranslations("ProfileSettings");
  const readiness = verificationReadiness({
    birthDate: birthDate === "" ? null : birthDate,
    residencePref: residencePref === "" ? null : residencePref,
  });
  const none = t("readiness.none");

  const summary = [
    {
      label: t("labels.homeCity"),
      value:
        homeCity === ""
          ? none
          : homeSpot === ""
            ? homeCity
            : `${homeCity} / ${homeSpot}`,
    },
    {
      label: t("labels.priority"),
      value: priority === "" ? none : t(`priorities.${priority}`),
    },
    {
      label: t("labels.budget"),
      value: budget === "" ? none : priceFormatter.format(Number(budget ?? 0)),
    },
    {
      label: t("labels.walletAddress"),
      value: walletAddress === "" ? none : t("readiness.ready"),
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-lg font-semibold">{t("readiness.title")}</h3>
      <p className="mt-1.5 text-sm text-muted">{t("readiness.description")}</p>
      <ul className="mt-4 space-y-2">
        {readiness.map(({ kind, ready }) => (
          <li
            key={kind}
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${
              ready
                ? "bg-warn-bg text-warn ring-warn-bg"
                : "bg-card-inner text-muted ring-border"
            }`}
          >
            {ready ? (
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span className="min-w-0">
              <span className="font-semibold">
                {t(`verifications.${kind}`)}
              </span>
              <span className="ml-1.5">
                {ready ? t("readiness.ready") : t("readiness.missing")}
              </span>
              {!ready && (
                <span className="mt-1 block">
                  {t(`readiness.note.${kind}`)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        {summary.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="shrink-0 text-muted">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
