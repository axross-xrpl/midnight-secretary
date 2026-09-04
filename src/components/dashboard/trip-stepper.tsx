"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import { shortHash } from "./flow";
import {
  dangerBoxClass,
  emptyStateClass,
  ghostButtonClass,
  labelClass,
  moneyFormatOptions,
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

const TripItemRow = ({ item }: { item: TripItemView }): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();
  const price = format.number(
    item.price.amount,
    moneyFormatOptions(item.price.currency),
  );

  return match(item)
    .with({ kind: "transport" }, (transport) => (
      <li className="flex flex-wrap items-center gap-2.5 py-2">
        <VendorCircle kind={transport.mode} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">
            {t("transport", {
              from: transport.from,
              to: transport.to,
              mode: t(`modes.${transport.mode}`),
            })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {format.dateTimeRange(
              new Date(transport.departAt),
              new Date(transport.arriveAt),
              { dateStyle: "medium", timeStyle: "short" },
            )}
            {" · "}
            {transport.vendor}
          </span>
        </span>
        <span className="text-[13px] font-bold tabular-nums">{price}</span>
      </li>
    ))
    .with({ kind: "lodging" }, (lodging) => (
      <li className="flex flex-wrap items-center gap-2.5 py-2">
        <VendorCircle kind="lodging" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">
            {t("lodging", { hotel: lodging.hotel, nights: lodging.nights })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {format.dateTimeRange(
              new Date(lodging.checkIn),
              new Date(lodging.checkOut),
              { dateStyle: "medium" },
            )}
            {" · "}
            {lodging.vendor}
          </span>
        </span>
        <span className="text-[13px] font-bold tabular-nums">{price}</span>
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
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border-sub">
        {plan.items.map((item) => (
          <TripItemRow key={itemKey(item)} item={item} />
        ))}
      </ul>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-end gap-2 border-t-2 border-divider-strong pt-2.5">
        <span className="text-xs text-muted">{t("total")}</span>
        <span className="text-[19px] font-bold tabular-nums">
          {format.number(
            plan.total.amount,
            moneyFormatOptions(plan.total.currency),
          )}
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

const AuthorizationSummary = ({
  authorization,
}: {
  authorization: AuthorizationView;
}): ReactElement => {
  const t = useTranslations("TripStepper");
  const format = useFormatter();
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
        <dt className={keyClass}>{t("authorizedAt")}</dt>
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
    <p className={dangerBoxClass} role="alert">
      {text}
    </p>
  );
};

const DoneCard = ({
  authorization,
  calendarEventId,
  onReset,
}: {
  authorization: AuthorizationView;
  calendarEventId: string;
  onReset: () => void;
}): ReactElement => {
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
          {t("writtenBody", { id: calendarEventId })}
        </p>
      </div>
      <div className="text-left">
        <AuthorizationSummary authorization={authorization} />
      </div>
      <div className="flex justify-center">
        <button type="button" className={okButtonClass} onClick={onReset}>
          {t("reset")}
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

  const rendered: Rendered = match(state)
    .with({ step: "idle" }, () => ({
      body: <p className={emptyStateClass}>{t("idle")}</p>,
    }))
    .with({ step: "proposing" }, ({ event }) => ({
      body: <Waiting message={t("proposing", { title: event.title })} />,
    }))
    .with({ step: "proposed" }, ({ plan }) => ({
      body: <PlanDetails plan={plan} />,
      actions: (
        <>
          <button
            type="button"
            className={strongButtonClass}
            onClick={onApprove}
          >
            {t("approve")}
          </button>
          <button type="button" className={ghostButtonClass} onClick={onReset}>
            {t("discard")}
          </button>
        </>
      ),
    }))
    .with({ step: "approved" }, ({ plan }) => ({
      body: <PlanDetails plan={plan} />,
      actions: (
        <>
          <button type="button" className={strongButtonClass} onClick={onPay}>
            {t("pay")}
          </button>
          <button type="button" className={ghostButtonClass} onClick={onReset}>
            {t("discard")}
          </button>
        </>
      ),
    }))
    .with({ step: "proving" }, ({ plan }) => ({
      body: (
        <>
          <PlanDetails plan={plan} />
          <Waiting message={t("proving")} hint={t("provingHint")} />
        </>
      ),
    }))
    .with({ step: "authorized" }, ({ authorization }) => ({
      body: (
        <>
          <h3 className="text-[13.5px] font-semibold">
            {t("authorizedTitle")}
          </h3>
          <AuthorizationSummary authorization={authorization} />
        </>
      ),
      actions: (
        <button
          type="button"
          className={primaryButtonClass}
          onClick={onWriteBack}
        >
          {t("writeBack")}
        </button>
      ),
    }))
    .with({ step: "writing" }, ({ authorization }) => ({
      body: (
        <>
          <AuthorizationSummary authorization={authorization} />
          <Waiting message={t("writing")} />
        </>
      ),
    }))
    .with({ step: "written" }, ({ authorization, calendarEventId }) => ({
      body: (
        <DoneCard
          authorization={authorization}
          calendarEventId={calendarEventId}
          onReset={onReset}
        />
      ),
    }))
    .with({ step: "failed" }, ({ plan, error }) => ({
      body: (
        <>
          <PlanDetails plan={plan} />
          <ErrorMessage error={error} />
        </>
      ),
      actions: (
        <button type="button" className={ghostButtonClass} onClick={onReset}>
          {t("reset")}
        </button>
      ),
    }))
    .exhaustive();

  const heading =
    state.step === "idle"
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
