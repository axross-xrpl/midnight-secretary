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
  budgetJpyc: string;
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
  budgetJpyc,
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
      label: t("labels.budgetJpyc"),
      value:
        budgetJpyc === ""
          ? none
          : priceFormatter.format(Number(budgetJpyc ?? 0)),
    },
    {
      label: t("labels.walletAddress"),
      value: walletAddress === "" ? none : t("readiness.ready"),
    },
  ];

  return (
    <div className="rounded-2xl border border-[#e5e8ec] bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold">{t("readiness.title")}</h3>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">
        {t("readiness.description")}
      </p>
      <ul className="mt-4 space-y-2">
        {readiness.map(({ kind, ready }) => (
          <li
            key={kind}
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${
              ready
                ? "bg-amber-50 text-amber-900 ring-amber-200"
                : "bg-slate-50 text-slate-600 ring-[#e5e8ec]"
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
                <span className="mt-1 block leading-5">
                  {t(`readiness.note.${kind}`)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-[#e5e8ec] pt-4 text-xs">
        {summary.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="shrink-0 text-slate-500">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
