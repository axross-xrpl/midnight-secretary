import { describe, expect, test } from "vitest";
import type { LodgingOffer, TransportOffer } from "@/domain/catalog";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseOfferId,
  parseTripId,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import type { Money } from "@/domain/money";
import type { TripPlan } from "@/domain/plan";
import type { PaidTrip } from "@/domain/trip";
import type { WriteBackTranslate } from "./write-back-text";
import { writeBackText } from "./write-back-text";

const demo = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "DEMO" };
};

const OUTBOUND: TransportOffer = {
  id: mustParse(parseOfferId("rail-tokyo-fukuoka")),
  mode: "rail",
  vendor: "JR",
  payee: mustParse(parseWalletAddress("demo-payee-jr")),
  origin: "東京",
  destination: "福岡",
  departAt: mustParse(parseIsoDateTime("2026-09-21T08:00:00+09:00")),
  arriveAt: mustParse(parseIsoDateTime("2026-09-21T13:00:00+09:00")),
  price: demo(23000),
};

const INBOUND: TransportOffer = {
  ...OUTBOUND,
  id: mustParse(parseOfferId("rail-fukuoka-tokyo")),
  origin: "福岡",
  destination: "東京",
  departAt: mustParse(parseIsoDateTime("2026-09-22T17:00:00+09:00")),
  arriveAt: mustParse(parseIsoDateTime("2026-09-22T22:00:00+09:00")),
};

const LODGING: LodgingOffer = {
  id: mustParse(parseOfferId("hotel-fukuoka")),
  vendor: "デモホテルズ",
  payee: mustParse(parseWalletAddress("demo-payee-hotels")),
  name: "デモホテル福岡",
  city: "福岡",
  checkIn: mustParse(parseIsoDate("2026-09-21")),
  checkOut: mustParse(parseIsoDate("2026-09-22")),
  price: demo(11000),
};

const planFor = (lodging: LodgingOffer | undefined): TripPlan => {
  return {
    intent: {
      destination: "福岡",
      departOn: mustParse(parseIsoDate("2026-09-21")),
      returnOn: mustParse(parseIsoDate("2026-09-22")),
      purpose: "福岡出張",
    },
    outbound: OUTBOUND,
    inbound: INBOUND,
    ...(lodging === undefined ? {} : { lodging }),
    total: lodging === undefined ? demo(46000) : demo(57000),
    rationale: "test",
  };
};

const tripFor = (lodging: LodgingOffer | undefined): PaidTrip => {
  const at = mustParse(parseIsoDateTime("2026-09-09T00:00:00Z"));

  return {
    status: "paid",
    id: mustParse(parseTripId("3f0f5a3e-9f4a-4a1e-8a3d-2b7c1f9a0e11")),
    event: {
      id: mustParse(parseCalendarEventId("seed-3")),
      title: "福岡出張",
      when: { kind: "timed", start: at, end: at },
    },
    plan: planFor(lodging),
    proposedAt: at,
    approvedAt: at,
    authorizations: [],
    paidAt: at,
  };
};

const entryText = ([key, value]: [string, string | number]): string => {
  return `${key}=${value}`;
};

// キーと values をそのまま文字列にして、どの文言をどの値で引いたかを見えるようにする
const t: WriteBackTranslate = (key, values) => {
  if (values === undefined) {
    return key;
  }

  return `${key}(${Object.entries(values).map(entryText).join(",")})`;
};

const TRANSPORT_TEXT = "transport(vendor=JR,mode=mode.rail)";

describe("writeBackText", () => {
  test("宿ありの出張は宿の名前を description に入れる", () => {
    expect(writeBackText(tripFor(LODGING), t)).toStrictEqual({
      title: "title(destination=福岡)",
      description: `description(purpose=福岡出張,outbound=${TRANSPORT_TEXT},inbound=${TRANSPORT_TEXT},lodging=デモホテル福岡,total=total(amount=57000,currency=DEMO))`,
    });
  });

  test("宿なしの出張は noLodging の文言を入れる", () => {
    expect(writeBackText(tripFor(undefined), t)).toStrictEqual({
      title: "title(destination=福岡)",
      description: `description(purpose=福岡出張,outbound=${TRANSPORT_TEXT},inbound=${TRANSPORT_TEXT},lodging=noLodging,total=total(amount=46000,currency=DEMO))`,
    });
  });
});
