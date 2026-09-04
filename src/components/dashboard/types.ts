/**
 * Display-ready amount in the smallest unit of its currency.
 * JPY has no minor unit, so `amount` is yen.
 */
export type MoneyView = {
  amount: number;
  currency: "JPY";
};

/**
 * The delegation as the user sees it. This is private state: only the user
 * and the secretary can read it.
 */
export type MandateView = {
  id: string;
  cap: MoneyView;
  spent: MoneyView;
  expiresAt: string;
  purpose: string;
  commitment: string;
};

/**
 * Whether a calendar event looks like a trip the secretary can arrange.
 */
export type EventClassification =
  | { kind: "trip"; destination: string }
  | { kind: "other" };

/**
 * A calendar event ready for display. Times are ISO 8601 strings.
 */
export type CalendarEventView = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  classification: EventClassification;
};

/**
 * One purchasable item of a proposed trip.
 */
export type TripItemView =
  | {
      kind: "transport";
      mode: "rail" | "air";
      from: string;
      to: string;
      departAt: string;
      arriveAt: string;
      vendor: string;
      price: MoneyView;
    }
  | {
      kind: "lodging";
      hotel: string;
      checkIn: string;
      checkOut: string;
      nights: number;
      vendor: string;
      price: MoneyView;
    };

/**
 * A trip plan proposed for one calendar event.
 */
export type TripPlanView = {
  id: string;
  eventId: string;
  destination: string;
  items: readonly TripItemView[];
  total: MoneyView;
  rationale: string;
};

/**
 * Proof that a payment was authorized under the mandate.
 * `publicHash` is the only value that reaches the public ledger.
 */
export type AuthorizationView = {
  paymentRef: string;
  publicHash: string;
  authorizedAt: string;
  amount: MoneyView;
};

/**
 * What anyone can read from the public ledger.
 * Deliberately free of amounts, caps, and identities.
 */
export type PublicLedgerView = {
  commitments: readonly { mandateId: string; commitment: string }[];
  authorizationHashes: readonly string[];
  authorizedCount: number;
};

/**
 * Expected failures when paying under the mandate.
 */
export type PaymentError =
  | { kind: "overBudget"; remaining: MoneyView; requested: MoneyView }
  | { kind: "expired"; expiresAt: string }
  | { kind: "proofFailed" };

/**
 * The one Wave 1 path, one step at a time. Each step carries exactly the data
 * produced so far, so no step can render a value it does not have.
 */
export type FlowState =
  | { step: "idle" }
  | { step: "proposing"; event: CalendarEventView }
  | { step: "proposed"; event: CalendarEventView; plan: TripPlanView }
  | { step: "approved"; event: CalendarEventView; plan: TripPlanView }
  | { step: "proving"; event: CalendarEventView; plan: TripPlanView }
  | {
      step: "authorized";
      event: CalendarEventView;
      plan: TripPlanView;
      authorization: AuthorizationView;
    }
  | {
      step: "writing";
      event: CalendarEventView;
      plan: TripPlanView;
      authorization: AuthorizationView;
    }
  | {
      step: "written";
      event: CalendarEventView;
      plan: TripPlanView;
      authorization: AuthorizationView;
      calendarEventId: string;
    }
  | {
      step: "failed";
      event: CalendarEventView;
      plan: TripPlanView;
      error: PaymentError;
    };

/**
 * Events that move the flow forward. The reducer ignores an action that does
 * not fit the current step.
 */
export type FlowAction =
  | { type: "propose"; event: CalendarEventView }
  | { type: "planReady"; plan: TripPlanView }
  | { type: "approve" }
  | { type: "pay" }
  | { type: "authorized"; authorization: AuthorizationView }
  | { type: "failed"; error: PaymentError }
  | { type: "writeBack" }
  | { type: "written"; calendarEventId: string }
  | { type: "reset" };
