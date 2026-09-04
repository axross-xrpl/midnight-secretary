"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import { shortHash } from "./flow";
import {
  cardClass,
  labelClass,
  moneyFormatOptions,
  primaryButtonClass,
  secondaryButtonClass,
} from "./styles";
import type {
  AuthorizationView,
  FlowState,
  PaymentError,
  TripItemView,
  TripPlanView,
} from "./types";

type Props = {
  state: FlowState;
  onApprove: () => void;
  onPay: () => void;
  onWriteBack: () => void;
  onReset: () => void;
};

const STEP_KEYS = ["proposed", "approved", "paid", "written"] as const;

type StepStatus = "done" | "current" | "todo";

const stepStatusClass = {
  done: "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black",
  current:
    "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100",
  todo: "border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500",
} as const satisfies Record<StepStatus, string>;

/**
 * Index of the step the flow is at or working toward. -1 before anything
 * has started.
 */
export const currentStepIndex = (state: FlowState): number => {
  return match(state.step)
    .with("idle", () => -1)
    .with("proposing", "proposed", () => 0)
    .with("approved", () => 1)
    .with("proving", "authorized", "failed", () => 2)
    .with("writing", "written", () => 3)
    .exhaustive();
};

const statusOf = (index: number, current: number): StepStatus => {
  if (index < current) {
    return "done";
  }

  if (index === current) {
    return "current";
  }

  return "todo";
};

const StepIndicator = ({ state }: { state: FlowState }): ReactElement => {
  const t = useTranslations("TripStepper");
  const current = currentStepIndex(state);
  const finished = state.step === "written";

  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {STEP_KEYS.map((key, index) => {
        const status = finished ? "done" : statusOf(index, current);

        return (
          <li
            key={key}
            className="flex items-center gap-2"
            aria-current={status === "current" ? "step" : undefined}
          >
            <span
              className={`grid size-6 place-items-center rounded-full border text-xs font-semibold tabular-nums ${stepStatusClass[status]}`}
            >
              {index + 1}
            </span>
            <span
              className={
                status === "todo" ? "text-zinc-400 dark:text-zinc-500" : ""
              }
            >
              {t(`steps.${key}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const TripItemRow = ({ item }: { item: TripItemView }): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();
  const price = format.number(
    item.price.amount,
    moneyFormatOptions(item.price.currency),
  );

  return match(item)
    .with({ kind: "transport" }, (transport) => (
      <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
        <div className="flex flex-col">
          <span>
            {t("transport", {
              from: transport.from,
              to: transport.to,
              mode: t(`modes.${transport.mode}`),
            })}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {format.dateTimeRange(
              new Date(transport.departAt),
              new Date(transport.arriveAt),
              { dateStyle: "medium", timeStyle: "short" },
            )}
            {" / "}
            {transport.vendor}
          </span>
        </div>
        <span className="tabular-nums">{price}</span>
      </li>
    ))
    .with({ kind: "lodging" }, (lodging) => (
      <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
        <div className="flex flex-col">
          <span>
            {t("lodging", { hotel: lodging.hotel, nights: lodging.nights })}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {format.dateTimeRange(
              new Date(lodging.checkIn),
              new Date(lodging.checkOut),
              { dateStyle: "medium" },
            )}
            {" / "}
            {lodging.vendor}
          </span>
        </div>
        <span className="tabular-nums">{price}</span>
      </li>
    ))
    .exhaustive();
};

const itemKey = (item: TripItemView): string => {
  return match(item)
    .with(
      { kind: "transport" },
      ({ from, to, departAt }) => `transport-${from}-${to}-${departAt}`,
    )
    .with(
      { kind: "lodging" },
      ({ hotel, checkIn }) => `lodging-${hotel}-${checkIn}`,
    )
    .exhaustive();
};

const PlanDetails = ({ plan }: { plan: TripPlanView }): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-black/8 dark:divide-white/[.145]">
        {plan.items.map((item) => (
          <TripItemRow key={itemKey(item)} item={item} />
        ))}
      </ul>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-black/8 pt-3 dark:border-white/[.145]">
        <span className={labelClass}>{t("total")}</span>
        <span className="text-xl font-semibold tabular-nums">
          {format.number(
            plan.total.amount,
            moneyFormatOptions(plan.total.currency),
          )}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className={labelClass}>{t("rationale")}</span>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
  return (
    <div
      className="flex flex-col gap-1 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-900"
      role="status"
      aria-busy="true"
    >
      <span className="flex items-center gap-2 font-medium">
        <span className="size-2 animate-pulse rounded-full bg-zinc-900 dark:bg-zinc-100" />
        {message}
      </span>
      {hint === undefined ? undefined : (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</span>
      )}
    </div>
  );
};

const AuthorizationSummary = ({
  authorization,
}: {
  authorization: AuthorizationView;
}): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();

  return (
    <dl className="grid gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/40 [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
      <div>
        <dt className={labelClass}>{t("publicHash")}</dt>
        <dd className="font-mono" title={authorization.publicHash}>
          {shortHash(authorization.publicHash)}
        </dd>
      </div>
      <div>
        <dt className={labelClass}>{t("paymentRef")}</dt>
        <dd className="font-mono">{authorization.paymentRef}</dd>
      </div>
      <div>
        <dt className={labelClass}>{t("authorizedAt")}</dt>
        <dd>
          {format.dateTime(new Date(authorization.authorizedAt), {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </dd>
      </div>
    </dl>
  );
};

const ErrorMessage = ({ error }: { error: PaymentError }): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();
  const text = match(error)
    .with({ kind: "overBudget" }, ({ remaining, requested }) =>
      t("errors.overBudget", {
        requested: format.number(
          requested.amount,
          moneyFormatOptions(requested.currency),
        ),
        remaining: format.number(
          remaining.amount,
          moneyFormatOptions(remaining.currency),
        ),
      }),
    )
    .with({ kind: "expired" }, ({ expiresAt }) =>
      t("errors.expired", {
        date: format.dateTime(new Date(expiresAt), { dateStyle: "medium" }),
      }),
    )
    .with({ kind: "proofFailed" }, () => t("errors.proofFailed"))
    .exhaustive();

  return (
    <p
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      role="alert"
    >
      {text}
    </p>
  );
};

/**
 * The one-path trip flow for the selected event: proposed, approved, paid
 * under the mandate, written back to the calendar.
 */
export const TripStepper = ({
  state,
  onApprove,
  onPay,
  onWriteBack,
  onReset,
}: Props): ReactElement => {
  const t = useTranslations("TripStepper");

  const body = match(state)
    .with({ step: "idle" }, () => (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("idle")}</p>
    ))
    .with({ step: "proposing" }, ({ event }) => (
      <Waiting message={t("proposing", { title: event.title })} />
    ))
    .with({ step: "proposed" }, ({ plan }) => (
      <div className="flex flex-col gap-4">
        <PlanDetails plan={plan} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={onApprove}
          >
            {t("approve")}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onReset}
          >
            {t("discard")}
          </button>
        </div>
      </div>
    ))
    .with({ step: "approved" }, ({ plan }) => (
      <div className="flex flex-col gap-4">
        <PlanDetails plan={plan} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButtonClass} onClick={onPay}>
            {t("pay")}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onReset}
          >
            {t("discard")}
          </button>
        </div>
      </div>
    ))
    .with({ step: "proving" }, ({ plan }) => (
      <div className="flex flex-col gap-4">
        <PlanDetails plan={plan} />
        <Waiting message={t("proving")} hint={t("provingHint")} />
      </div>
    ))
    .with({ step: "authorized" }, ({ authorization }) => (
      <div className="flex flex-col gap-4">
        <h3 className="font-semibold">{t("authorizedTitle")}</h3>
        <AuthorizationSummary authorization={authorization} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={onWriteBack}
          >
            {t("writeBack")}
          </button>
        </div>
      </div>
    ))
    .with({ step: "writing" }, ({ authorization }) => (
      <div className="flex flex-col gap-4">
        <AuthorizationSummary authorization={authorization} />
        <Waiting message={t("writing")} />
      </div>
    ))
    .with({ step: "written" }, ({ authorization, calendarEventId }) => (
      <div className="flex flex-col gap-4">
        <h3 className="font-semibold">{t("writtenTitle")}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("writtenBody", { id: calendarEventId })}
        </p>
        <AuthorizationSummary authorization={authorization} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onReset}
          >
            {t("reset")}
          </button>
        </div>
      </div>
    ))
    .with({ step: "failed" }, ({ plan, error }) => (
      <div className="flex flex-col gap-4">
        <PlanDetails plan={plan} />
        <ErrorMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={onReset}
          >
            {t("reset")}
          </button>
        </div>
      </div>
    ))
    .exhaustive();

  const heading =
    state.step === "idle"
      ? t("title")
      : t("titleFor", { title: state.event.title });

  return (
    <section className={`${cardClass} flex flex-col gap-5`}>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{heading}</h2>
        <StepIndicator state={state} />
      </div>
      {body}
    </section>
  );
};
