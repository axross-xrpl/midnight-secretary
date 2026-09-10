"use client";

import type { DateTimeFormatOptions } from "next-intl";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import type {
  AuthorizationResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
import { FailureNotice } from "./failure-notice";
import { stepIndexOf } from "./flow";
import type { FormatNumber, PlanRow } from "./format";
import { moneyText, nightsOf, planRows, shortHash } from "./format";
import {
  emptyStateClass,
  ghostButtonClass,
  labelClass,
  noteClass,
  okButtonClass,
  panelBodyClass,
  panelCardClass,
  panelFooterClass,
  primaryButtonClass,
  strongButtonClass,
  vendorMark,
  warnPillClass,
} from "./styles";
import type { RequestFailure, Step, StepperState } from "./types";

type Props = {
  state: StepperState;
  onApprove: (trip: TripResponse) => void;
  onRepropose: (eventId: string) => void;
  onPay: (trip: TripResponse) => void;
  onWriteBack: (trip: TripResponse) => void;
  onDismiss: () => void;
  onDeselect: () => void;
};

const STEP_KEYS = ["proposed", "approved", "paid", "written"] as const;

const TIMED_OPTIONS: DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

// 宿泊は日付だけの文字列なので、時差で前日にずれないよう UTC のまま出す
const DATE_OPTIONS: DateTimeFormatOptions = {
  dateStyle: "medium",
  timeZone: "UTC",
};

type StepStatus = "done" | "current" | "todo";

const stepCircleClass = {
  done: "bg-ok text-white",
  current: "bg-accent text-white",
  todo: "bg-neutral-bg text-faint",
} as const satisfies Record<StepStatus, string>;

const stepLabelClass = {
  done: "text-muted",
  current: "font-bold text-ink",
  todo: "text-muted",
} as const satisfies Record<StepStatus, string>;

const statusOf = (index: number, current: number): StepStatus => {
  if (index < current) {
    return "done";
  }

  if (index === current) {
    return "current";
  }

  return "todo";
};

const isFinished = (state: StepperState): boolean => {
  return state.kind === "arranged" && state.trip.status === "written";
};

const StepIndicator = ({ state }: { state: StepperState }): ReactElement => {
  const t = useTranslations("TripStepper");
  const current = stepIndexOf(state);
  const finished = isFinished(state);

  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {STEP_KEYS.map((key, index) => {
        const status = finished ? "done" : statusOf(index, current);

        return (
          <li
            key={key}
            className="flex items-center"
            aria-current={status === "current" ? "step" : undefined}
          >
            {index === 0 ? undefined : (
              <span
                className="mx-2 h-0.5 w-2.5 bg-divider-strong"
                aria-hidden="true"
              />
            )}
            <span
              className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${stepCircleClass[status]}`}
            >
              {status === "done" ? "✓" : index + 1}
            </span>
            <span className={`ml-2 text-[12.5px] ${stepLabelClass[status]}`}>
              {t(`steps.${key}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const VendorCircle = ({
  kind,
}: {
  kind: keyof typeof vendorMark;
}): ReactElement => {
  return (
    <span
      className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs text-white ${vendorMark[kind].circleClass}`}
      aria-hidden="true"
    >
      {vendorMark[kind].icon}
    </span>
  );
};

const TripItemRow = ({ row }: { row: PlanRow }): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();
  const formatNumber: FormatNumber = (amount) => {
    return format.number(amount);
  };

  return match(row)
    .with({ kind: "transport" }, ({ offer }) => (
      <li className="flex flex-wrap items-center gap-2.5 py-2">
        <VendorCircle kind={offer.mode} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">
            {t("transport", {
              from: offer.origin,
              to: offer.destination,
              mode: t(`modes.${offer.mode}`),
            })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {format.dateTimeRange(
              new Date(offer.departAt),
              new Date(offer.arriveAt),
              TIMED_OPTIONS,
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
            {t("lodging", {
              hotel: offer.name,
              nights: nightsOf(offer.checkIn, offer.checkOut),
            })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {format.dateTimeRange(
              new Date(offer.checkIn),
              new Date(offer.checkOut),
              DATE_OPTIONS,
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

const PlanDetails = ({ plan }: { plan: TripPlanResponse }): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();
  const formatNumber: FormatNumber = (amount) => {
    return format.number(amount);
  };

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border-sub">
        {planRows(plan).map((row) => (
          <TripItemRow key={row.offer.id} row={row} />
        ))}
      </ul>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-end gap-2 border-t-2 border-divider-strong pt-2.5">
        <span className="text-xs text-muted">{t("total")}</span>
        <span className="text-[19px] font-bold tabular-nums">
          {moneyText(plan.total, formatNumber)}
        </span>
      </div>
      <div className="mt-3 border-t border-dashed border-divider-strong pt-2.5">
        <div className="mb-1 text-xs font-semibold text-accent">
          {t("rationale")}
        </div>
        <p className="text-[12px] leading-relaxed text-muted">
          {plan.rationale}
        </p>
      </div>
    </div>
  );
};

const Waiting = ({
  message,
  hint,
}: {
  message: string;
  hint?: string;
}): ReactElement => {
  const t = useTranslations("TripStepper");

  return (
    <div className="flex flex-col gap-2" role="status" aria-busy="true">
      <span className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-semibold">
        <span
          className="h-2 w-2 animate-pulse rounded-full bg-accent"
          aria-hidden="true"
        />
        {message}
        <span className={warnPillClass}>{t("inProgress")}</span>
      </span>
      {hint === undefined ? undefined : <p className={noteClass}>{hint}</p>}
    </div>
  );
};

type AuthorizationsProps = {
  authorizations: readonly AuthorizationResponse[];
};

const AuthorizationRow = ({
  authorization,
}: {
  authorization: AuthorizationResponse;
}): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();
  const formatNumber: FormatNumber = (amount) => {
    return format.number(amount);
  };
  const rowClass = "flex flex-wrap items-center gap-3 p-3 px-3.5";
  const keyClass = "w-[120px] flex-none text-[10.5px] font-bold text-faint";

  return (
    <dl className="flex flex-col divide-y divide-border-sub overflow-hidden rounded-xl border border-border-sub bg-surface text-[12.5px]">
      <div className={rowClass}>
        <dt className={keyClass}>{t("publicHash")}</dt>
        <dd
          className="font-mono text-[10.5px] text-accent"
          title={authorization.publicHash}
        >
          {shortHash(authorization.publicHash)}
        </dd>
      </div>
      <div className={rowClass}>
        <dt className={keyClass}>{t("paymentRef")}</dt>
        <dd className="font-mono text-[10.5px]">{authorization.paymentRef}</dd>
      </div>
      <div className={rowClass}>
        <dt className={keyClass}>{t("amount")}</dt>
        <dd className="font-bold tabular-nums">
          {moneyText(authorization.amount, formatNumber)}
        </dd>
      </div>
      <div className={rowClass}>
        <dt className={keyClass}>{t("authorizedAt")}</dt>
        <dd>
          {format.dateTime(new Date(authorization.authorizedAt), TIMED_OPTIONS)}
        </dd>
      </div>
      <div className={rowClass}>
        <dt className={keyClass}>{t("transaction")}</dt>
        <dd className="font-mono text-[10.5px]">
          {authorization.settlement.transactionId}
        </dd>
      </div>
    </dl>
  );
};

const AuthorizationList = ({
  authorizations,
}: AuthorizationsProps): ReactElement => {
  return (
    <div className="flex flex-col gap-2">
      {authorizations.map((authorization) => (
        <AuthorizationRow
          key={authorization.paymentRef}
          authorization={authorization}
        />
      ))}
    </div>
  );
};

type BusyBodyProps = {
  step: Step;
  event: { title: string };
  trip?: TripResponse;
};

const BusyBody = ({ step, event, trip }: BusyBodyProps): ReactElement => {
  const t = useTranslations("TripStepper");
  const waiting = match(step)
    .with("propose", () => (
      <Waiting message={t("proposing", { title: event.title })} />
    ))
    .with("approve", () => <Waiting message={t("approving")} />)
    .with("pay", () => (
      <Waiting message={t("proving")} hint={t("provingHint")} />
    ))
    .with("writeBack", () => <Waiting message={t("writing")} />)
    .exhaustive();

  if (trip === undefined) {
    return waiting;
  }

  return (
    <>
      <PlanDetails plan={trip.plan} />
      {waiting}
    </>
  );
};

type FailedBodyProps = {
  failure: RequestFailure;
  trip?: TripResponse;
};

const FailedBody = ({ failure, trip }: FailedBodyProps): ReactElement => {
  if (trip === undefined) {
    return <FailureNotice failure={failure} />;
  }

  return (
    <>
      <PlanDetails plan={trip.plan} />
      <FailureNotice failure={failure} />
    </>
  );
};

type PlanWithAuthorizationsProps = {
  plan: TripPlanResponse;
  authorizations: readonly AuthorizationResponse[];
};

// 途中で失敗した支払いを再試行するときは、済んだ候補が残っている
const ApprovedBody = ({
  plan,
  authorizations,
}: PlanWithAuthorizationsProps): ReactElement => {
  const t = useTranslations("TripStepper");

  if (authorizations.length === 0) {
    return <PlanDetails plan={plan} />;
  }

  return (
    <>
      <PlanDetails plan={plan} />
      <AuthorizationList authorizations={authorizations} />
      <p className={noteClass}>{t("partiallyPaid")}</p>
    </>
  );
};

const PaidBody = ({
  plan,
  authorizations,
}: PlanWithAuthorizationsProps): ReactElement => {
  const t = useTranslations("TripStepper");

  return (
    <>
      <PlanDetails plan={plan} />
      <h3 className="text-[13.5px] font-semibold">{t("authorizedTitle")}</h3>
      <AuthorizationList authorizations={authorizations} />
    </>
  );
};

const PayAction = ({
  resume,
  onPay,
}: {
  resume: boolean;
  onPay: () => void;
}): ReactElement => {
  const t = useTranslations("TripStepper");

  return (
    <button type="button" className={strongButtonClass} onClick={onPay}>
      {resume ? t("resumePay") : t("pay")}
    </button>
  );
};

type DoneCardProps = {
  writtenEventId: string;
  authorizations: readonly AuthorizationResponse[];
  onDeselect: () => void;
};

const DoneCard = ({
  writtenEventId,
  authorizations,
  onDeselect,
}: DoneCardProps): ReactElement => {
  const t = useTranslations("TripStepper");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-done-border bg-done-bg p-4 text-center">
      <div
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ok text-lg text-white"
        aria-hidden="true"
      >
        ✓
      </div>
      <div>
        <h3 className="text-[14.5px] font-bold">{t("writtenTitle")}</h3>
        <p className="mt-1 text-[12.5px] text-muted">
          {t("writtenBody", { id: writtenEventId })}
        </p>
      </div>
      <div className="text-left">
        <AuthorizationList authorizations={authorizations} />
      </div>
      <div className="flex justify-center">
        <button type="button" className={okButtonClass} onClick={onDeselect}>
          {t("another")}
        </button>
      </div>
    </div>
  );
};

type Rendered = {
  body: ReactElement;
  actions?: ReactElement;
};

/**
 * 選んだ予定の一本道 (提案、承認、支払い枠での支払い、カレンダーへの登録)
 *
 * 休止状態は props の trip から、進行中の 1 手はクライアントの状態から来る
 */
export const TripStepper = ({
  state,
  onApprove,
  onRepropose,
  onPay,
  onWriteBack,
  onDismiss,
  onDeselect,
}: Props): ReactElement => {
  const t = useTranslations("TripStepper");

  const rendered: Rendered = match(state)
    .with({ kind: "idle" }, () => ({
      body: <p className={emptyStateClass}>{t("idle")}</p>,
    }))
    .with({ kind: "unarranged" }, () => ({
      body: <p className={emptyStateClass}>{t("unarranged")}</p>,
    }))
    .with({ kind: "busy" }, ({ step, event, trip }) => ({
      body: <BusyBody step={step} event={event} trip={trip} />,
    }))
    .with({ kind: "failed" }, ({ failure, trip }) => ({
      body: <FailedBody failure={failure} trip={trip} />,
      actions: (
        <button type="button" className={ghostButtonClass} onClick={onDismiss}>
          {t("dismiss")}
        </button>
      ),
    }))
    .with(
      { kind: "arranged", trip: { status: "proposed" } },
      ({ event, trip }) => ({
        body: <PlanDetails plan={trip.plan} />,
        actions: (
          <>
            <button
              type="button"
              className={strongButtonClass}
              onClick={() => onApprove(trip)}
            >
              {t("approve")}
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => onRepropose(event.id)}
            >
              {t("repropose")}
            </button>
          </>
        ),
      }),
    )
    .with({ kind: "arranged", trip: { status: "approved" } }, ({ trip }) => ({
      body: (
        <ApprovedBody plan={trip.plan} authorizations={trip.authorizations} />
      ),
      actions: (
        <PayAction
          resume={trip.authorizations.length > 0}
          onPay={() => onPay(trip)}
        />
      ),
    }))
    .with({ kind: "arranged", trip: { status: "paid" } }, ({ trip }) => ({
      body: <PaidBody plan={trip.plan} authorizations={trip.authorizations} />,
      actions: (
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => onWriteBack(trip)}
        >
          {t("writeBack")}
        </button>
      ),
    }))
    .with({ kind: "arranged", trip: { status: "written" } }, ({ trip }) => ({
      body: (
        <DoneCard
          writtenEventId={trip.writtenEventId}
          authorizations={trip.authorizations}
          onDeselect={onDeselect}
        />
      ),
    }))
    .exhaustive();

  const heading =
    state.kind === "idle"
      ? t("title")
      : t("titleFor", { title: state.event.title });

  return (
    <section className={panelCardClass}>
      <div className={panelBodyClass}>
        <div className="flex flex-col gap-3">
          <h2 className="text-[13.5px] font-semibold">{heading}</h2>
          <StepIndicator state={state} />
        </div>
        {rendered.body}
      </div>
      {rendered.actions === undefined ? undefined : (
        <div className={panelFooterClass}>{rendered.actions}</div>
      )}
    </section>
  );
};
