import { describe, expect, test } from "vitest";
import type { LodgingOffer, TransportOffer } from "./catalog";
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

const planFor = (lodging: LodgingOffer | undefined): TripPlan => {
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
    total: lodging === undefined ? mst(29440) : mst(41440),
    rationale: "test",
  };
};

const ONE_NIGHT = planFor(LODGING);

const SAME_DAY = planFor(undefined);

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
