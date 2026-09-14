import { describe, expect, test } from "vitest";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseTripId,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import type { ConfirmedTrip, ConfirmedTripItem } from "@/domain/store";
import type { ScanEvent, ScanEventTime } from "@/lib/calendar-scan-response";
import type {
  PaymentVisibilityResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
import { tripIdAt } from "@/testing/ids";
import { activeTripsOf, candidateEventsOf, confirmedTripsOf } from "./rows";

const timedOn = (date: string): ScanEventTime => {
  return {
    kind: "timed",
    start: `${date}T10:00:00+09:00`,
    end: `${date}T17:00:00+09:00`,
  };
};

const eventOf = (id: string, title: string, date: string): ScanEvent => {
  return { id, title, when: timedOn(date) };
};

const MEETING = eventOf("seed-1", "チーム定例", "2026-09-11");

const OSAKA = eventOf("seed-2", "大阪出張 (取引先訪問)", "2026-09-14");

const DENTIST = eventOf("seed-4", "歯医者", "2026-09-17");

const EXPO: ScanEvent = {
  id: "seed-3",
  title: "大阪出張 (展示会)",
  when: { kind: "allDay", startDate: "2026-09-21", endDate: "2026-09-23" },
  location: "大阪市住之江区",
};

// 秘書が書き戻した予定 (WRITTEN の writtenEventId)
const WRITTEN_EVENT = eventOf("written-1", "大阪 出張", "2026-09-14");

// Fake のカレンダーと同じ日時順 (seed-4 が seed-3 より先)
const EVENTS: readonly ScanEvent[] = [MEETING, OSAKA, DENTIST, EXPO];

const mst = (amount: number): { amount: number; currency: "MST" } => {
  return { amount, currency: "MST" };
};

const RAIL = {
  id: "rail-tokyo-osaka",
  mode: "rail",
  vendor: "デモ鉄道",
  payee: "wallet-rail",
  origin: "東京",
  destination: "新大阪",
  departAt: "2026-09-14T09:00:00+09:00",
  arriveAt: "2026-09-14T11:30:00+09:00",
  price: mst(14720),
} as const;

const PLAN: TripPlanResponse = {
  intent: {
    destination: "大阪",
    departOn: "2026-09-14",
    returnOn: "2026-09-14",
    purpose: "取引先訪問",
  },
  outbound: RAIL,
  inbound: { ...RAIL, id: "rail-osaka-tokyo" },
  total: mst(29440),
  rationale: "日帰りで往復できる",
};

const ALL_PUBLIC: PaymentVisibilityResponse = {
  outbound: "public",
  inbound: "public",
};

const BASE = {
  id: tripIdAt(1),
  event: OSAKA,
  plan: PLAN,
  proposedAt: "2026-09-10T00:00:00Z",
};

const PROPOSED: TripResponse = { status: "proposed", ...BASE };

const APPROVED: TripResponse = {
  status: "approved",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [],
};

const PAID: TripResponse = {
  status: "paid",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [],
  paidAt: "2026-09-10T00:02:00Z",
};

const WRITTEN: TripResponse = {
  status: "written",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [],
  paidAt: "2026-09-10T00:02:00Z",
  writtenEventId: WRITTEN_EVENT.id,
  writtenAt: "2026-09-10T00:03:00Z",
};

// 別の予定 (展示会、終日) の trip
const EXPO_PROPOSED: TripResponse = {
  status: "proposed",
  ...BASE,
  id: tripIdAt(2),
  event: EXPO,
  proposedAt: "2026-09-11T00:00:00Z",
};

const idsOf = (events: readonly ScanEvent[]): string[] => {
  return events.map((event) => event.id);
};

// 確定旅程は `trips` / `trip_items` の行から作るので、Trip とは別の形で渡ってくる
const confirmedOf = (id: number, startDate: string): ConfirmedTrip => {
  return {
    id: mustParse(parseTripId(tripIdAt(id))),
    title: "大阪出張",
    originCity: "東京",
    destinationCity: "大阪",
    startDate: mustParse(parseIsoDate(startDate)),
    items: [],
    total: { amount: mustParse(parseAmount(29440)), currency: "MST" },
    confirmedAt: mustParse(parseIsoDateTime(`${startDate}T00:03:00Z`)),
  };
};

const OSAKA_CONFIRMED = confirmedOf(1, "2026-09-14");

const EXPO_CONFIRMED = confirmedOf(2, "2026-09-21");

// 書き戻した予定を持つ明細 (確定旅程の明細は全て同じ googleEventId を持つ)
const itemWrittenTo = (googleEventId: string): ConfirmedTripItem => {
  return {
    seq: 1,
    category: "rail",
    serviceId: RAIL.id,
    name: RAIL.vendor,
    price: {
      amount: mustParse(parseAmount(RAIL.price.amount)),
      currency: "MST",
    },
    payee: mustParse(parseWalletAddress(RAIL.payee)),
    googleEventId: mustParse(parseCalendarEventId(googleEventId)),
  };
};

// DB に残った確定旅程 (元の予定 seed-2 と、書き戻した予定 written-1 を占めている)
const OSAKA_REGISTERED: ConfirmedTrip = {
  ...OSAKA_CONFIRMED,
  sourceEventId: mustParse(parseCalendarEventId(OSAKA.id)),
  items: [itemWrittenTo(WRITTEN_EVENT.id)],
};

// 元の予定を持たない行 (書き戻した予定だけを占めている)
const REGISTERED_WITHOUT_SOURCE: ConfirmedTrip = {
  ...OSAKA_CONFIRMED,
  items: [itemWrittenTo(WRITTEN_EVENT.id)],
};

describe("candidateEventsOf", () => {
  test("trip が無ければ全件をそのまま", () => {
    expect(candidateEventsOf(EVENTS, [], [])).toStrictEqual(EVENTS);
  });

  test("trip のある予定は状態を問わず除く", () => {
    expect(candidateEventsOf(EVENTS, [PROPOSED], [])).toStrictEqual([
      MEETING,
      DENTIST,
      EXPO,
    ]);
    expect(candidateEventsOf(EVENTS, [APPROVED], [])).toStrictEqual([
      MEETING,
      DENTIST,
      EXPO,
    ]);
    expect(candidateEventsOf(EVENTS, [PAID], [])).toStrictEqual([
      MEETING,
      DENTIST,
      EXPO,
    ]);
  });

  test("秘書が書き戻した予定と、その元の予定を除く", () => {
    expect(
      idsOf(candidateEventsOf([...EVENTS, WRITTEN_EVENT], [WRITTEN], [])),
    ).toStrictEqual(["seed-1", "seed-4", "seed-3"]);
  });

  test("登録前の trip は書き戻した予定を隠さない", () => {
    expect(
      idsOf(candidateEventsOf([...EVENTS, WRITTEN_EVENT], [PAID], [])),
    ).toStrictEqual(["seed-1", "seed-4", "seed-3", "written-1"]);
  });

  test("順序は events のままで、trips の順序に影響されない", () => {
    expect(
      idsOf(candidateEventsOf(EVENTS, [EXPO_PROPOSED, APPROVED], [])),
    ).toStrictEqual(["seed-1", "seed-4"]);
    expect(
      idsOf(
        candidateEventsOf(EVENTS.toReversed(), [APPROVED, EXPO_PROPOSED], []),
      ),
    ).toStrictEqual(["seed-4", "seed-1"]);
  });

  test("窓に無い予定の trip は行を増やさない", () => {
    expect(candidateEventsOf([MEETING], [PROPOSED], [])).toStrictEqual([
      MEETING,
    ]);
  });

  test("確定旅程の元の予定と、その書き戻した予定を除く (trip がメモリに無くても)", () => {
    expect(
      idsOf(
        candidateEventsOf([...EVENTS, WRITTEN_EVENT], [], [OSAKA_REGISTERED]),
      ),
    ).toStrictEqual(["seed-1", "seed-4", "seed-3"]);
  });

  test("元の予定を持たない確定旅程は、書き戻した予定だけを除く", () => {
    expect(
      idsOf(
        candidateEventsOf(
          [...EVENTS, WRITTEN_EVENT],
          [],
          [REGISTERED_WITHOUT_SOURCE],
        ),
      ),
    ).toStrictEqual(["seed-1", "seed-2", "seed-4", "seed-3"]);
  });

  test("確定旅程が空なら trip の除外だけが効く", () => {
    expect(
      idsOf(candidateEventsOf([...EVENTS, WRITTEN_EVENT], [WRITTEN], [])),
    ).toStrictEqual(["seed-1", "seed-4", "seed-3"]);
    expect(candidateEventsOf(EVENTS, [], [])).toStrictEqual(EVENTS);
  });
});

describe("activeTripsOf", () => {
  test("written 以外の 3 つの状態を残す", () => {
    expect(activeTripsOf([PROPOSED])).toStrictEqual([PROPOSED]);
    expect(activeTripsOf([APPROVED])).toStrictEqual([APPROVED]);
    expect(activeTripsOf([PAID])).toStrictEqual([PAID]);
  });

  test("written は除く", () => {
    expect(activeTripsOf([WRITTEN])).toStrictEqual([]);
    expect(activeTripsOf([])).toStrictEqual([]);
  });

  test("予定の開始順に並べ、trips の順序 (新しい順) に影響されない", () => {
    expect(activeTripsOf([EXPO_PROPOSED, WRITTEN, APPROVED])).toStrictEqual([
      APPROVED,
      EXPO_PROPOSED,
    ]);
  });
});

describe("confirmedTripsOf", () => {
  test("出発日の古い順に並べる (store は新しい順で返す)", () => {
    expect(confirmedTripsOf([EXPO_CONFIRMED, OSAKA_CONFIRMED])).toStrictEqual([
      OSAKA_CONFIRMED,
      EXPO_CONFIRMED,
    ]);
  });

  test("0 件なら空", () => {
    expect(confirmedTripsOf([])).toStrictEqual([]);
  });
});
