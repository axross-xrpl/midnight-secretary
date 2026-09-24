"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import type { MandateResponse, TripResponse } from "@/lib/secretary-response";
import { moneyText, remainingOf } from "./format";
import type { MoneyFlow, PayeeFlow, PayeeFlowStatus } from "./money-flow";
import { moneyFlowOf } from "./money-flow";
import {
  faintLabelClass,
  labelClass,
  neutralPillClass,
  okPillClass,
  privatePillClass,
  sectionLabelClass,
  sidebarCardClass,
  vendorMark,
} from "./styles";
import { useFormatNumber } from "./use-format-number";

// 三者を縦に並べ、間を細い線でつなぐ (横に並べるにはサイドバーが狭い)
const nodeClass = `${sidebarCardClass} flex flex-col gap-3`;
const connectorClass = "ml-8 h-5 w-px bg-divider-strong";
const nodeMarkClass =
  "flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold";
const amountClass = "text-lg font-semibold tabular-nums";

const statusPillClass = (status: PayeeFlowStatus): string => {
  return match(status)
    .with("unpaid", () => neutralPillClass)
    .with("held", () => privatePillClass)
    .with("released", () => okPillClass)
    .exhaustive();
};

type NodeHeaderProps = {
  markClass: string;
  mark: string;
  title: string;
};

const NodeHeader = ({
  markClass,
  mark,
  title,
}: NodeHeaderProps): ReactElement => {
  return (
    <div className="flex items-center gap-2">
      <span className={`${nodeMarkClass} ${markClass}`} aria-hidden="true">
        {mark}
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
    </div>
  );
};

type TravelerNodeProps = {
  mandate?: MandateResponse;
};

const TravelerNode = ({ mandate }: TravelerNodeProps): ReactElement => {
  const t = useTranslations("MoneyFlow");
  const formatNumber = useFormatNumber();

  return (
    <div className={nodeClass}>
      <NodeHeader
        markClass="bg-neutral-bg text-ink"
        mark={t("traveler.title").slice(0, 1)}
        title={t("traveler.title")}
      />
      {mandate === undefined ? (
        <p className={labelClass}>{t("traveler.none")}</p>
      ) : (
        <dl>
          <dt className={labelClass}>{t("traveler.granted")}</dt>
          <dd className={amountClass}>
            {moneyText(mandate.cap, formatNumber)}
          </dd>
        </dl>
      )}
    </div>
  );
};

type SecretaryNodeProps = {
  mandate?: MandateResponse;
  flow: MoneyFlow;
};

const SecretaryNode = ({ mandate, flow }: SecretaryNodeProps): ReactElement => {
  const t = useTranslations("MoneyFlow");
  const formatNumber = useFormatNumber();

  return (
    <div className={nodeClass}>
      <NodeHeader
        markClass="bg-accent text-white"
        mark={t("secretary.title").slice(0, 1)}
        title={t("secretary.title")}
      />
      {mandate === undefined ? undefined : (
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className={labelClass}>{t("secretary.holding")}</dt>
            <dd className={amountClass}>
              {flow.held === undefined
                ? "—"
                : moneyText(flow.held, formatNumber)}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>{t("secretary.unspent")}</dt>
            <dd className={amountClass}>
              {moneyText(remainingOf(mandate), formatNumber)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
};

type PayeeRowProps = {
  payee: PayeeFlow;
};

const PayeeRow = ({ payee }: PayeeRowProps): ReactElement => {
  const t = useTranslations("MoneyFlow");
  const formatNumber = useFormatNumber();

  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs text-white ${vendorMark[payee.kind].circleClass}`}
        aria-hidden="true"
      >
        {vendorMark[payee.kind].icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{payee.title}</span>
        <span className="block text-sm font-semibold tabular-nums">
          {moneyText(payee.amount, formatNumber)}
        </span>
      </span>
      <span className={statusPillClass(payee.status)}>
        {t(`status.${payee.status}`)}
      </span>
    </li>
  );
};

type PayeesNodeProps = {
  flow: MoneyFlow;
};

const PayeesNode = ({ flow }: PayeesNodeProps): ReactElement => {
  const t = useTranslations("MoneyFlow");
  const formatNumber = useFormatNumber();

  return (
    <div className={nodeClass}>
      <NodeHeader
        markClass="bg-neutral-bg text-ink"
        mark={t("payees.title").slice(0, 1)}
        title={t("payees.title")}
      />
      {flow.payees.length === 0 ? (
        <p className={labelClass}>{t("payees.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-sub">
          {flow.payees.map((payee) => (
            <PayeeRow key={payee.key} payee={payee} />
          ))}
        </ul>
      )}
      {flow.released === undefined ? undefined : (
        <dl className="flex items-baseline justify-between gap-3 border-t border-border-sub pt-3">
          <dt className={labelClass}>{t("payees.received")}</dt>
          <dd className={amountClass}>
            {moneyText(flow.released, formatNumber)}
          </dd>
        </dl>
      )}
    </div>
  );
};

type MoneyFlowPanelProps = {
  mandate?: MandateResponse;
  trip?: TripResponse;
};

/**
 * 「あなた -> 秘書 -> 受取先」の順に、お金がいまどこにあるかを見せる
 *
 * 受取先の行は計画の行と同じ順で、未払い / 預かり中 / 受取済みを持つ
 * 預かりはこのビルドではアプリの状態で、コントラクトには無い (注記で明示する)
 */
export const MoneyFlowPanel = ({
  mandate,
  trip,
}: MoneyFlowPanelProps): ReactElement => {
  const t = useTranslations("MoneyFlow");
  const flow = moneyFlowOf(trip);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className={sectionLabelClass}>{t("title")}</h2>
        <p className={labelClass}>{t("subtitle")}</p>
      </div>
      <div className="flex flex-col">
        <TravelerNode mandate={mandate} />
        <div className={connectorClass} aria-hidden="true" />
        <SecretaryNode mandate={mandate} flow={flow} />
        <div className={connectorClass} aria-hidden="true" />
        <PayeesNode flow={flow} />
      </div>
      <p className={faintLabelClass}>{t("note")}</p>
    </section>
  );
};
