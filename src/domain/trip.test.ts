import { describe, expect, test } from "vitest";
import type { LodgingOffer, PlaceOffer, TransportOffer } from "./catalog";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseMandateId,
  parseOfferId,
  parsePaymentRef,
  parseTripId,
  parseWalletAddress,
} from "./identifiers.parse";
import type { Authorization } from "./mandate";
import type { Money } from "./money";
import type { TripPlan } from "./plan";
import type { ProposedTrip } from "./trip";
import {
  allPublic,
  markApproved,
  markPaid,
  markWritten,
  visibilityFor,
} from "./trip";

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const at = mustParse(parseIsoDateTime("2026-09-09T00:00:00Z"));

const OUTBOUND: TransportOffer = {
  id: mustParse(parseOfferId("rail-tokyo-osaka")),
  mode: "rail",
  vendor: "JR",
  payee: mustParse(parseWalletAddress("demo-payee-jr")),
  origin: "東京",
  destination: "大阪",
  departAt: mustParse(parseIsoDateTime("2026-09-14T09:00:00+09:00")),
  arriveAt: mustParse(parseIsoDateTime("2026-09-14T11:30:00+09:00")),
  price: mst(14720),
};

const INBOUND: TransportOffer = {
  ...OUTBOUND,
  id: mustParse(parseOfferId("rail-osaka-tokyo")),
  origin: "大阪",
  destination: "東京",
  departAt: mustParse(parseIsoDateTime("2026-09-15T17:00:00+09:00")),
  arriveAt: mustParse(parseIsoDateTime("2026-09-15T19:30:00+09:00")),
};

const LODGING: LodgingOffer = {
  id: mustParse(parseOfferId("hotel-osaka")),
  vendor: "デモホテルズ",
  payee: mustParse(parseWalletAddress("demo-payee-hotels")),
  name: "デモホテル大阪",
  city: "大阪",
  checkIn: mustParse(parseIsoDate("2026-09-14")),
  checkOut: mustParse(parseIsoDate("2026-09-15")),
  price: mst(12000),
};

const DINING: PlaceOffer = {
  id: mustParse(parseOfferId("restaurant-izakaya-tenma")),
  kind: "restaurant",
  payee: mustParse(parseWalletAddress("demo-payee-service")),
  name: "天満 立ち飲み居酒屋 大和",
  city: "大阪",
  genre: "居酒屋",
  price: mst(3000),
  requiredVerifications: ["age"],
  ageLimit: 20,
};

const LEISURE: PlaceOffer = {
  id: mustParse(parseOfferId("leisure-kaiyukan")),
  kind: "leisure",
  payee: mustParse(parseWalletAddress("demo-payee-service")),
  name: "海遊館",
  city: "大阪",
  genre: "aquarium",
  price: mst(2700),
  requiredVerifications: [],
};

type PlanOptions = {
  lodging?: LodgingOffer;
  dining?: PlaceOffer;
  leisure?: PlaceOffer;
};

const planFor = (options: PlanOptions): TripPlan => {
  const { lodging, dining, leisure } = options;
  const extra =
    (lodging === undefined ? 0 : 12000) +
    (dining === undefined ? 0 : 3000) +
    (leisure === undefined ? 0 : 2700);

  return {
    intent: {
      destination: "大阪",
      departOn: mustParse(parseIsoDate("2026-09-14")),
      returnOn: mustParse(parseIsoDate("2026-09-15")),
      purpose: "取引先訪問",
    },
    outbound: OUTBOUND,
    inbound: INBOUND,
    ...(lodging === undefined ? {} : { lodging }),
    ...(dining === undefined ? {} : { dining }),
    ...(leisure === undefined ? {} : { leisure }),
    total: mst(29440 + extra),
    rationale: "test",
  };
};

const ONE_NIGHT = planFor({ lodging: LODGING });

const SAME_DAY = planFor({});

const WITH_DINING = planFor({ lodging: LODGING, dining: DINING });

const WITH_EVERYTHING = planFor({
  lodging: LODGING,
  dining: DINING,
  leisure: LEISURE,
});

const proposedWith = (plan: TripPlan): ProposedTrip => {
  return {
    status: "proposed",
    id: mustParse(parseTripId("3f0f5a3e-9f4a-4a1e-8a3d-2b7c1f9a0e11")),
    event: {
      id: mustParse(parseCalendarEventId("seed-3")),
      title: "大阪出張",
      when: { kind: "timed", start: at, end: at },
    },
    plan,
    proposedAt: at,
  };
};

const AUTHORIZATION: Authorization = {
  mandateId: mustParse(parseMandateId("mandate-1")),
  paymentRef: mustParse(parsePaymentRef("trip:1")),
  amount: mst(14720),
  authorizedAt: at,
  publicHash: "hash:mandate-1:trip:1",
  settlement: {
    kind: "tokenTransfer",
    transactionId: "tx-1",
    recipient: OUTBOUND.payee,
  },
};

describe("allPublic", () => {
  test("宿のある計画は 3 候補すべてが公開になる", () => {
    expect(allPublic(ONE_NIGHT)).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
    });
  });

  test("日帰りの計画は宿を持たない", () => {
    expect(allPublic(SAME_DAY)).toStrictEqual({
      outbound: "public",
      inbound: "public",
    });
  });

  test("飲食のある計画は飲食も公開になる", () => {
    expect(allPublic(WITH_DINING)).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
      dining: "public",
    });
  });

  test("全部ある計画は 5 候補すべてが公開になる", () => {
    expect(allPublic(WITH_EVERYTHING)).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
      dining: "public",
      leisure: "public",
    });
  });
});

describe("visibilityFor", () => {
  test("指定の無い候補は公開になる", () => {
    expect(visibilityFor(ONE_NIGHT, {})).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
    });
  });

  test("指定した候補だけが非公開になる", () => {
    expect(visibilityFor(ONE_NIGHT, { lodging: "private" })).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "private",
    });
  });

  test("計画に無い宿の指定は捨てる", () => {
    expect(
      visibilityFor(SAME_DAY, { outbound: "private", lodging: "private" }),
    ).toStrictEqual({ outbound: "private", inbound: "public" });
  });

  test("飲食のある計画では飲食だけを非公開にできる", () => {
    expect(visibilityFor(WITH_DINING, { dining: "private" })).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
      dining: "private",
    });
  });

  test("計画に無い飲食の指定は捨てる", () => {
    expect(visibilityFor(ONE_NIGHT, { dining: "private" })).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
    });
  });

  test("レジャーのある計画ではレジャーだけを非公開にできる", () => {
    expect(
      visibilityFor(WITH_EVERYTHING, { leisure: "private" }),
    ).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
      dining: "public",
      leisure: "private",
    });
  });

  test("計画に無いレジャーの指定は捨てる", () => {
    expect(visibilityFor(WITH_DINING, { leisure: "private" })).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "public",
      dining: "public",
    });
  });
});

describe("markApproved", () => {
  test("承認と公開範囲を記録し、支払いと登録まで引き継ぐ", () => {
    const visibility = visibilityFor(ONE_NIGHT, { lodging: "private" });

    const approved = markApproved(proposedWith(ONE_NIGHT), at, visibility);

    expect(approved.visibility).toStrictEqual({
      outbound: "public",
      inbound: "public",
      lodging: "private",
    });
    expect(approved.authorizations).toStrictEqual([]);

    const paid = markPaid(approved, [AUTHORIZATION], at);

    expect(paid.visibility).toStrictEqual(approved.visibility);

    const written = markWritten(
      paid,
      mustParse(parseCalendarEventId("written-1")),
      at,
    );

    expect(written.visibility).toStrictEqual(approved.visibility);
  });
});
