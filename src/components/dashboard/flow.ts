import { match } from "ts-pattern";
import { isPast } from "./time";
import type {
  AuthorizationView,
  CalendarEventView,
  FlowAction,
  FlowState,
  MandateView,
  MoneyView,
  PaymentError,
  PublicLedgerView,
  TripPlanView,
} from "./types";

/**
 * Cap minus spent, in the mandate's currency.
 */
export const remainingAllowance = (mandate: MandateView): MoneyView => {
  return {
    amount: mandate.cap.amount - mandate.spent.amount,
    currency: mandate.cap.currency,
  };
};

/**
 * Checks whether `total` can be paid under `mandate` at `now`.
 * Returns the reason when it cannot, undefined when it can.
 */
export const checkPayment = (
  mandate: MandateView,
  total: MoneyView,
  now: string,
): PaymentError | undefined => {
  if (isPast(mandate.expiresAt, now)) {
    return { kind: "expired", expiresAt: mandate.expiresAt };
  }

  const remaining = remainingAllowance(mandate);

  if (total.amount > remaining.amount) {
    return { kind: "overBudget", remaining, requested: total };
  }

  return undefined;
};

/**
 * Records a payment against the mandate's private state.
 */
export const applyPayment = (
  mandate: MandateView,
  amount: MoneyView,
): MandateView => {
  return {
    ...mandate,
    spent: { ...mandate.spent, amount: mandate.spent.amount + amount.amount },
  };
};

/**
 * Appends an authorization hash to the public ledger view.
 */
export const appendAuthorization = (
  ledger: PublicLedgerView,
  publicHash: string,
): PublicLedgerView => {
  return {
    ...ledger,
    authorizationHashes: [...ledger.authorizationHashes, publicHash],
    authorizedCount: ledger.authorizedCount + 1,
  };
};

/**
 * Derives the payment reference for a plan. Deterministic, so a retry cannot
 * pay the same plan twice.
 */
export const paymentRefFor = (planId: string): string => {
  return `pay:${planId}`;
};

const fnv1a = (input: string): number => {
  return Array.from(input).reduce((hash, char) => {
    return Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }, 0x811c9dc5);
};

/**
 * Builds a 64-hex-digit hash from a string. Sample stand-in for the contract's
 * authorization hash; deterministic for the same input.
 */
export const sampleHash = (input: string): string => {
  const words = Array.from({ length: 8 }, (_, index) => {
    return fnv1a(`${input}:${index}`).toString(16).padStart(8, "0");
  });

  return `0x${words.join("")}`;
};

/**
 * Shortens a hash for display, keeping the prefix and suffix.
 */
export const shortHash = (hash: string, head = 10, tail = 6): string => {
  if (hash.length <= head + tail + 3) {
    return hash;
  }

  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
};

/**
 * Sample authorization for a plan, as the contract would return it.
 */
export const sampleAuthorization = (
  plan: TripPlanView,
  mandateId: string,
  now: string,
): AuthorizationView => {
  const paymentRef = paymentRefFor(plan.id);

  return {
    paymentRef,
    publicHash: sampleHash(`${mandateId}:${paymentRef}`),
    authorizedAt: now,
    amount: plan.total,
  };
};

const onPropose = (state: FlowState, event: CalendarEventView): FlowState => {
  if (
    state.step !== "idle" &&
    state.step !== "written" &&
    state.step !== "failed"
  ) {
    return state;
  }

  return { step: "proposing", event };
};

const onPlanReady = (state: FlowState, plan: TripPlanView): FlowState => {
  if (state.step !== "proposing") {
    return state;
  }

  return { step: "proposed", event: state.event, plan };
};

const onApprove = (state: FlowState): FlowState => {
  if (state.step !== "proposed") {
    return state;
  }

  return { step: "approved", event: state.event, plan: state.plan };
};

const onPay = (state: FlowState): FlowState => {
  if (state.step !== "approved") {
    return state;
  }

  return { step: "proving", event: state.event, plan: state.plan };
};

const onAuthorized = (
  state: FlowState,
  authorization: AuthorizationView,
): FlowState => {
  if (state.step !== "proving") {
    return state;
  }

  return {
    step: "authorized",
    event: state.event,
    plan: state.plan,
    authorization,
  };
};

const onFailed = (state: FlowState, error: PaymentError): FlowState => {
  if (state.step !== "proving") {
    return state;
  }

  return { step: "failed", event: state.event, plan: state.plan, error };
};

const onWriteBack = (state: FlowState): FlowState => {
  if (state.step !== "authorized") {
    return state;
  }

  return {
    step: "writing",
    event: state.event,
    plan: state.plan,
    authorization: state.authorization,
  };
};

const onWritten = (state: FlowState, calendarEventId: string): FlowState => {
  if (state.step !== "writing") {
    return state;
  }

  return {
    step: "written",
    event: state.event,
    plan: state.plan,
    authorization: state.authorization,
    calendarEventId,
  };
};

/**
 * Pure transition function for the one-path flow. Actions that do not fit the
 * current step leave the state unchanged.
 */
export const reduceFlow = (state: FlowState, action: FlowAction): FlowState => {
  return match(action)
    .with({ type: "propose" }, ({ event }) => onPropose(state, event))
    .with({ type: "planReady" }, ({ plan }) => onPlanReady(state, plan))
    .with({ type: "approve" }, () => onApprove(state))
    .with({ type: "pay" }, () => onPay(state))
    .with({ type: "authorized" }, ({ authorization }) =>
      onAuthorized(state, authorization),
    )
    .with({ type: "failed" }, ({ error }) => onFailed(state, error))
    .with({ type: "writeBack" }, () => onWriteBack(state))
    .with({ type: "written" }, ({ calendarEventId }) =>
      onWritten(state, calendarEventId),
    )
    .with({ type: "reset" }, (): FlowState => ({ step: "idle" }))
    .exhaustive();
};

/**
 * True while a simulated background step is running.
 */
export const isBusy = (state: FlowState): boolean => {
  return (
    state.step === "proposing" ||
    state.step === "proving" ||
    state.step === "writing"
  );
};
