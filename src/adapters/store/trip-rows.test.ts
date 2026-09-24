import { describe, expect, test } from "vitest";
import type {
  LodgingOffer,
  PlaceOffer,
  TransportOffer,
} from "@/domain/catalog";
import type {
  CalendarEventId,
  IsoDate,
  IsoDateTime,
  OfferId,
  TripId,
  UserId,
  WalletAddress,
} from "@/domain/identifiers";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseMandateId,
  parseOfferId,
  parseUserId,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import type { Authorization } from "@/domain/mandate";
import { paymentRefFor } from "@/domain/mandate.parse";
import type { Money } from "@/domain/money";
import type { TripPlan } from "@/domain/plan";
import type { WrittenTrip } from "@/domain/trip";
import type { Result } from "@/lib/result";
import { tripIdOf } from "@/testing/ids";
import type { ConfirmedTripItemRow, ConfirmedTripRow } from "./trip-rows";
import {
  confirmedTripOf,
  confirmedTripOfWritten,
  tripItemRowsOf,
  tripRowOf,
} from "./trip-rows";

const USER: UserId = mustParse(parseUserId("user-1"));

const TRIP: TripId = tripIdOf(1);

const EVENT: CalendarEventId = mustParse(parseCalendarEventId("seed-2"));

const WRITTEN_EVENT: CalendarEventId = mustParse(
  parseCalendarEventId("written-1"),
);

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const on = (raw: string): IsoDate => {
  return mustParse(parseIsoDate(raw));
};

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const offerId = (raw: string): OfferId => {
  return mustParse(parseOfferId(raw));
};

const payee = (raw: string): WalletAddress => {
  return mustParse(parseWalletAddress(raw));
};

const OUTBOUND: TransportOffer = {
  id: offerId("rail-tokyo-osaka"),
  mode: "rail",
  vendor: "JR東海道新幹線 ひかり505号",
  payee: payee("wallet-rail-out"),
  origin: "東京",
  destination: "新大阪",
  departAt: at("2026-09-14T08:33:00+09:00"),
  arriveAt: at("2026-09-14T11:30:00+09:00"),
  price: mst(14400),
};

const INBOUND: TransportOffer = {
  id: offerId("air-itm-hnd"),
  mode: "air",
  vendor: "デモ航空 302便",
  payee: payee("wallet-air-in"),
  origin: "ITM",
  destination: "HND",
  departAt: at("2026-09-14T18:00:00+09:00"),
  arriveAt: at("2026-09-14T19:10:00+09:00"),
  price: mst(14520),
};

const LODGING: LodgingOffer = {
  id: offerId("hotel-namba-c"),
  vendor: "なんばホテルC",
  payee: payee("wallet-hotel"),
  name: "なんばホテルC",
  city: "大阪",
  checkIn: on("2026-09-21"),
  checkOut: on("2026-09-22"),
  price: mst(12500),
};

const DINING: PlaceOffer = {
  id: offerId("izakaya-tenma-yamato"),
  kind: "restaurant",
  payee: payee("wallet-izakaya"),
  name: "天満 立ち飲み居酒屋 大和",
  city: "大阪",
  price: mst(3000),
  requiredVerifications: ["age"],
  ageLimit: 20,
};

const LEISURE: PlaceOffer = {
  id: offerId("leisure-kaiyukan"),
  kind: "leisure",
  payee: payee("wallet-kaiyukan"),
  name: "海遊館",
  city: "大阪",
  price: mst(2700),
  requiredVerifications: [],
};

const dayTripPlan = (): TripPlan => {
  return {
    intent: {
      destination: "大阪",
      departOn: on("2026-09-14"),
      returnOn: on("2026-09-14"),
      purpose: "取引先訪問",
    },
    outbound: OUTBOUND,
    inbound: INBOUND,
    total: mst(28920),
    rationale: "日帰りで往復できる",
  };
};

const overnightPlan = (): TripPlan => {
  return {
    intent: {
      destination: "大阪",
      departOn: on("2026-09-21"),
      returnOn: on("2026-09-22"),
      purpose: "展示会",
    },
    outbound: OUTBOUND,
    inbound: INBOUND,
    lodging: LODGING,
    dining: DINING,
    leisure: LEISURE,
    total: mst(47120),
    rationale: "1 泊で回れる",
  };
};

const authorizationFor = (offer: OfferId): Authorization => {
  const paymentRef = paymentRefFor(TRIP, offer);

  return {
    mandateId: mustParse(parseMandateId("mandate-1")),
    paymentRef,
    amount: mst(1),
    authorizedAt: at("2026-09-09T00:00:00Z"),
    publicHash: `hash:${offer}`,
    settlement: {
      kind: "tokenTransfer",
      transactionId: `tx:${offer}`,
      recipient: payee("wallet-any"),
    },
    escrow: { status: "held", heldAt: at("2026-09-09T00:00:00Z") },
  };
};

const writtenTrip = (plan: TripPlan): WrittenTrip => {
  const offers = [
    plan.outbound.id,
    plan.inbound.id,
    ...(plan.lodging === undefined ? [] : [plan.lodging.id]),
    ...(plan.dining === undefined ? [] : [plan.dining.id]),
    ...(plan.leisure === undefined ? [] : [plan.leisure.id]),
  ];

  return {
    status: "written",
    id: TRIP,
    event: {
      id: EVENT,
      title: "大阪出張 (取引先訪問)",
      when: {
        kind: "timed",
        start: at("2026-09-14T10:00:00+09:00"),
        end: at("2026-09-14T17:00:00+09:00"),
      },
    },
    plan,
    proposedAt: at("2026-09-09T00:00:00Z"),
    approvedAt: at("2026-09-09T00:01:00Z"),
    visibility: { outbound: "public", inbound: "public" },
    authorizations: offers.map(authorizationFor),
    paidAt: at("2026-09-09T00:02:00Z"),
    writtenEventId: WRITTEN_EVENT,
    writtenAt: at("2026-09-09T00:03:00Z"),
  };
};

const SERVICE_IDS: Readonly<Record<OfferId, string>> = {
  [OUTBOUND.id]: "11111111-1111-4111-8111-111111111111",
  [INBOUND.id]: "22222222-2222-4222-8222-222222222222",
  [LODGING.id]: "33333333-3333-4333-8333-333333333333",
  [DINING.id]: "44444444-4444-4444-8444-444444444444",
  [LEISURE.id]: "55555555-5555-4555-8555-555555555555",
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

describe("tripRowOf", () => {
  test("日帰りでも end_date に出発日を入れ、status は confirmed", () => {
    expect(tripRowOf(USER, writtenTrip(dayTripPlan()))).toStrictEqual({
      id: TRIP,
      userId: USER,
      title: "大阪出張 (取引先訪問)",
      originCity: "東京",
      destinationCity: "大阪",
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      status: "confirmed",
      sourceEventId: "seed-2",
    });
  });

  test("1 泊なら end_date は復路の日", () => {
    const row = tripRowOf(USER, writtenTrip(overnightPlan()));

    expect(row.startDate).toBe("2026-09-21");
    expect(row.endDate).toBe("2026-09-22");
  });
});

describe("tripItemRowsOf", () => {
  test("日帰りは往路と復路の 2 行で、seq は支払いの順に 1 から", () => {
    const trip = writtenTrip(dayTripPlan());
    const rows = mustOk(tripItemRowsOf(trip, SERVICE_IDS));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toStrictEqual({
      tripId: TRIP,
      seq: 1,
      category: "rail",
      serviceId: SERVICE_IDS[OUTBOUND.id],
      nameSnapshot: "JR東海道新幹線 ひかり505号",
      unitPrice: 14400,
      quantity: 1,
      price: 14400,
      payeeSnapshot: "wallet-rail-out",
      startAt: new Date("2026-09-14T08:33:00+09:00"),
      endAt: new Date("2026-09-14T11:30:00+09:00"),
      status: "booked",
      bookingRef: `hash:${OUTBOUND.id}`,
      googleEventId: "written-1",
    });
    // 航空は category が air になる
    expect(rows[1]?.category).toBe("air");
  });

  test("1 泊 + 飲食 + レジャーは 5 行で、category と時刻が候補ごとに決まる", () => {
    const trip = writtenTrip(overnightPlan());
    const rows = mustOk(tripItemRowsOf(trip, SERVICE_IDS));

    expect(rows.map((row) => row.category)).toStrictEqual([
      "rail",
      "air",
      "hotel",
      "restaurant",
      "leisure",
    ]);
    expect(rows.map((row) => row.seq)).toStrictEqual([1, 2, 3, 4, 5]);
    // 宿は check-in / check-out を JST の日の始まりで、飲食とレジャーは時刻を持たない
    expect(rows[2]?.startAt).toStrictEqual(
      new Date("2026-09-21T00:00:00+09:00"),
    );
    expect(rows[2]?.endAt).toStrictEqual(new Date("2026-09-22T00:00:00+09:00"));
    expect("startAt" in (rows[3] ?? {})).toBe(false);
    expect("endAt" in (rows[4] ?? {})).toBe(false);
    // 予約の参照はその候補の支払いの公開ハッシュ
    expect(rows[3]?.bookingRef).toBe(`hash:${DINING.id}`);
    // 表に旅程単位の列が無いので、書き戻した予定の id は全明細に入る
    expect(rows.map((row) => row.googleEventId)).toStrictEqual(
      Array.from({ length: 5 }, () => "written-1"),
    );
  });

  test("サービス行の id を引けない候補があれば失敗する", () => {
    const trip = writtenTrip(dayTripPlan());

    expect(
      tripItemRowsOf(trip, { [OUTBOUND.id]: SERVICE_IDS[OUTBOUND.id] ?? "" }),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "unavailable",
        cause: { reason: "serviceIdMissing", offerId: INBOUND.id },
      },
    });
  });
});

describe("confirmedTripOfWritten", () => {
  test("計画から明細と合計を作り、確定の時点は書き戻した時刻", () => {
    const trip = writtenTrip(overnightPlan());
    const confirmed = confirmedTripOfWritten(trip);

    expect(confirmed.id).toBe(TRIP);
    expect(confirmed.title).toBe("大阪出張 (取引先訪問)");
    expect(confirmed.originCity).toBe("東京");
    expect(confirmed.destinationCity).toBe("大阪");
    expect(confirmed.startDate).toBe("2026-09-21");
    expect(confirmed.endDate).toBe("2026-09-22");
    expect(confirmed.sourceEventId).toBe("seed-2");
    expect(confirmed.total).toStrictEqual(mst(47120));
    expect(confirmed.confirmedAt).toBe("2026-09-09T00:03:00Z");
    expect(confirmed.items.map((item) => item.category)).toStrictEqual([
      "rail",
      "air",
      "hotel",
      "restaurant",
      "leisure",
    ]);
    // 引き直しを通らないので候補の code がそのまま入る
    expect(confirmed.items[0]?.serviceId).toBe(OUTBOUND.id);
  });
});

const TRIP_ROW: ConfirmedTripRow = {
  id: TRIP,
  title: "大阪出張 (取引先訪問)",
  originCity: "東京",
  destinationCity: "大阪",
  startDate: "2026-09-14",
  endDate: "2026-09-14",
  sourceEventId: "seed-2",
  createdAt: new Date("2026-09-09T00:03:00Z"),
};

const ITEM_ROW: ConfirmedTripItemRow = {
  seq: 1,
  category: "rail",
  serviceId: "11111111-1111-4111-8111-111111111111",
  nameSnapshot: "JR東海道新幹線 ひかり505号",
  price: 14400,
  payeeSnapshot: "wallet-rail-out",
  startAt: new Date("2026-09-14T08:33:00+09:00"),
  endAt: new Date("2026-09-14T11:30:00+09:00"),
  googleEventId: "written-1",
};

describe("confirmedTripOf", () => {
  test("行から確定旅程を作り、合計は明細の合計になる", () => {
    const confirmed = mustOk(
      confirmedTripOf(TRIP_ROW, [
        ITEM_ROW,
        { ...ITEM_ROW, seq: 2, category: "air", price: 14520 },
      ]),
    );

    expect(confirmed.id).toBe(TRIP);
    expect(confirmed.startDate).toBe("2026-09-14");
    expect(confirmed.endDate).toBe("2026-09-14");
    expect(confirmed.sourceEventId).toBe("seed-2");
    expect(confirmed.confirmedAt).toBe("2026-09-09T00:03:00.000Z");
    expect(confirmed.total).toStrictEqual(mst(28920));
    expect(confirmed.items[0]).toStrictEqual({
      seq: 1,
      category: "rail",
      serviceId: ITEM_ROW.serviceId,
      name: "JR東海道新幹線 ひかり505号",
      price: mst(14400),
      payee: "wallet-rail-out",
      startAt: "2026-09-13T23:33:00.000Z",
      endAt: "2026-09-14T02:30:00.000Z",
      googleEventId: "written-1",
    });
  });

  test("端の列が無い行でも作れる (明細 0 件は合計 0)", () => {
    const confirmed = mustOk(
      confirmedTripOf(
        {
          id: TRIP,
          title: "",
          originCity: "東京",
          destinationCity: "大阪",
          startDate: "2026-09-14",
          createdAt: new Date("2026-09-09T00:03:00Z"),
        },
        [],
      ),
    );

    expect("endDate" in confirmed).toBe(false);
    expect("sourceEventId" in confirmed).toBe(false);
    expect(confirmed.items).toStrictEqual([]);
    expect(confirmed.total).toStrictEqual(mst(0));
  });

  test("知らない category の行は schema の失敗にする", () => {
    expect(
      confirmedTripOf(TRIP_ROW, [{ ...ITEM_ROW, category: "taxi" }]),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "schema",
        issues: [{ path: ["category"], message: "invalid category: taxi" }],
      },
    });
  });

  test("日付にならない start_date は schema の失敗にする", () => {
    expect(
      confirmedTripOf({ ...TRIP_ROW, startDate: "2026-02-30" }, []),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "schema",
        issues: [{ path: ["isoDate"], message: "invalid isoDate: 2026-02-30" }],
      },
    });
  });
});
