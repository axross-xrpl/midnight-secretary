// Sample data for the dashboard demo. Nothing here comes from a real calendar,
// catalog, or contract; a later PR replaces it with the domain ports.

import { sampleHash } from "./flow";
import { addDays, atHour } from "./time";
import type {
  CalendarEventView,
  MandateView,
  MoneyView,
  PublicLedgerView,
  TripItemView,
  TripPlanView,
} from "./types";

const jpy = (amount: number): MoneyView => {
  return { amount, currency: "JPY" };
};

const SAMPLE_MANDATE_ID = "mandate-2026-09";

/**
 * The sample mandate: 150,000 JPY cap, 20,000 JPY already spent, valid for
 * 30 days from `now`.
 */
export const sampleMandate = (now: string): MandateView => {
  return {
    id: SAMPLE_MANDATE_ID,
    cap: jpy(150_000),
    spent: jpy(20_000),
    expiresAt: addDays(now, 30),
    purpose: "Business trips, September 2026",
    commitment: sampleHash(`${SAMPLE_MANDATE_ID}:commitment`),
  };
};

/**
 * Five upcoming events in the 14 days after `now`. Three look like trips.
 */
export const sampleEvents = (now: string): readonly CalendarEventView[] => {
  return [
    {
      id: "evt-weekly-sync",
      title: "Weekly team sync",
      start: atHour(addDays(now, 1), 1),
      end: atHour(addDays(now, 1), 2),
      allDay: false,
      classification: { kind: "other" },
    },

    {
      id: "evt-osaka",
      title: "Osaka: visit Sample Inc.",
      start: atHour(addDays(now, 3), 4),
      end: atHour(addDays(now, 3), 8),
      allDay: false,
      location: "Osaka, Chuo-ku",
      classification: { kind: "trip", destination: "Osaka" },
    },

    {
      id: "evt-dentist",
      title: "Dentist appointment",
      start: atHour(addDays(now, 5), 9),
      end: atHour(addDays(now, 5), 10),
      allDay: false,
      classification: { kind: "other" },
    },

    {
      id: "evt-fukuoka",
      title: "Fukuoka developer conference",
      start: addDays(now, 8),
      end: addDays(now, 9),
      allDay: true,
      location: "Fukuoka International Congress Center",
      classification: { kind: "trip", destination: "Fukuoka" },
    },

    {
      id: "evt-sapporo",
      title: "Sapporo: on-site support for Sample Foods",
      start: atHour(addDays(now, 11), 0),
      end: atHour(addDays(now, 13), 9),
      allDay: false,
      location: "Sapporo",
      classification: { kind: "trip", destination: "Sapporo" },
    },
  ];
};

const sumPrices = (items: readonly TripItemView[]): MoneyView => {
  return jpy(items.reduce((total, item) => total + item.price.amount, 0));
};

const plan = (
  event: CalendarEventView,
  destination: string,
  items: readonly TripItemView[],
  rationale: string,
): TripPlanView => {
  return {
    id: `plan-${event.id}`,
    eventId: event.id,
    destination,
    items,
    total: sumPrices(items),
    rationale,
  };
};

const osakaPlan = (event: CalendarEventView): TripPlanView => {
  const outbound = event.start;
  const inbound = event.end;

  return plan(
    event,
    "Osaka",
    [
      {
        kind: "transport",
        mode: "rail",
        from: "Tokyo",
        to: "Shin-Osaka",
        departAt: outbound,
        arriveAt: atHour(outbound, 6),
        vendor: "JR Central (Nozomi)",
        price: jpy(14_720),
      },

      {
        kind: "lodging",
        hotel: "Sample Hotel Osaka Honmachi",
        checkIn: event.start,
        checkOut: addDays(event.start, 1),
        nights: 1,
        vendor: "Sample Hotel Group",
        price: jpy(12_000),
      },

      {
        kind: "transport",
        mode: "rail",
        from: "Shin-Osaka",
        to: "Tokyo",
        departAt: atHour(addDays(inbound, 1), 1),
        arriveAt: atHour(addDays(inbound, 1), 4),
        vendor: "JR Central (Nozomi)",
        price: jpy(14_720),
      },
    ],
    "Door-to-door the Nozomi beats flying for a 10:00 meeting in Chuo-ku, and one night nearby avoids a 5:00 departure.",
  );
};

const fukuokaPlan = (event: CalendarEventView): TripPlanView => {
  return plan(
    event,
    "Fukuoka",
    [
      {
        kind: "transport",
        mode: "air",
        from: "Tokyo Haneda",
        to: "Fukuoka",
        departAt: atHour(event.start, 22),
        arriveAt: atHour(addDays(event.start, 1), 0),
        vendor: "Sample Air",
        price: jpy(24_000),
      },

      {
        kind: "lodging",
        hotel: "Sample Hotel Hakata Station",
        checkIn: event.start,
        checkOut: event.end,
        nights: 1,
        vendor: "Sample Hotel Group",
        price: jpy(11_000),
      },

      {
        kind: "transport",
        mode: "air",
        from: "Fukuoka",
        to: "Tokyo Haneda",
        departAt: atHour(event.end, 10),
        arriveAt: atHour(event.end, 12),
        vendor: "Sample Air",
        price: jpy(24_000),
      },
    ],
    "The conference runs two days, so fly in the evening before and stay next to Hakata Station for the venue shuttle.",
  );
};

const sapporoPlan = (event: CalendarEventView): TripPlanView => {
  return plan(
    event,
    "Sapporo",
    [
      {
        kind: "transport",
        mode: "air",
        from: "Tokyo Haneda",
        to: "New Chitose",
        departAt: atHour(addDays(event.start, -1), 8),
        arriveAt: atHour(addDays(event.start, -1), 10),
        vendor: "Sample Air",
        price: jpy(36_000),
      },

      {
        kind: "lodging",
        hotel: "Sample Hotel Sapporo Odori",
        checkIn: addDays(event.start, -1),
        checkOut: event.end,
        nights: 3,
        vendor: "Sample Hotel Group",
        price: jpy(63_000),
      },

      {
        kind: "transport",
        mode: "air",
        from: "New Chitose",
        to: "Tokyo Haneda",
        departAt: atHour(event.end, 10),
        arriveAt: atHour(event.end, 12),
        vendor: "Sample Air",
        price: jpy(36_000),
      },
    ],
    "Three days on site need three nights; this exceeds what is left on the mandate, so approval will surface the shortfall.",
  );
};

/**
 * The sample plan for a trip event, or undefined when the event is not a trip.
 */
export const samplePlanFor = (
  event: CalendarEventView,
): TripPlanView | undefined => {
  if (event.classification.kind !== "trip") {
    return undefined;
  }

  const builders: Record<string, (event: CalendarEventView) => TripPlanView> = {
    Osaka: osakaPlan,
    Fukuoka: fukuokaPlan,
    Sapporo: sapporoPlan,
  };

  const build = builders[event.classification.destination];

  return build === undefined ? undefined : build(event);
};

/**
 * The public ledger before any payment: one commitment, no authorizations.
 */
export const sampleLedger = (mandate: MandateView): PublicLedgerView => {
  return {
    commitments: [{ mandateId: mandate.id, commitment: mandate.commitment }],
    authorizationHashes: [],
    authorizedCount: 0,
  };
};
