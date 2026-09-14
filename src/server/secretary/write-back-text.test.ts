import { describe, expect, test } from "vitest";
import type {
  LodgingOffer,
  PlaceOffer,
  TransportOffer,
} from "@/domain/catalog";
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
import type { PaidTrip, PaymentVisibility } from "@/domain/trip";
import { allPublic } from "@/domain/trip";
import type { WriteBackTranslate } from "./write-back-text";
import { writeBackText } from "./write-back-text";

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
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
  price: mst(23000),
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
  price: mst(11000),
};

const DINING: PlaceOffer = {
  id: mustParse(parseOfferId("restaurant-izakaya-hakata")),
  kind: "restaurant",
  payee: mustParse(parseWalletAddress("demo-payee-service")),
  name: "博多 居酒屋 大和",
  city: "福岡",
  genre: "居酒屋",
  price: mst(3000),
  requiredVerifications: ["age"],
  ageLimit: 20,
};

const LEISURE: PlaceOffer = {
  id: mustParse(parseOfferId("leisure-fukuoka-tower")),
  kind: "leisure",
  payee: mustParse(parseWalletAddress("demo-payee-service")),
  name: "福岡タワー",
  city: "福岡",
  genre: "sightseeing",
  price: mst(800),
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
    (lodging === undefined ? 0 : 11000) +
    (dining === undefined ? 0 : 3000) +
    (leisure === undefined ? 0 : 800);

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
    ...(dining === undefined ? {} : { dining }),
    ...(leisure === undefined ? {} : { leisure }),
    total: mst(46000 + extra),
    rationale: "test",
  };
};

const tripFor = (options: PlanOptions): PaidTrip => {
  const at = mustParse(parseIsoDateTime("2026-09-09T00:00:00Z"));
  const plan = planFor(options);
  const visibility: PaymentVisibility = allPublic(plan);

  return {
    status: "paid",
    id: mustParse(parseTripId("3f0f5a3e-9f4a-4a1e-8a3d-2b7c1f9a0e11")),
    event: {
      id: mustParse(parseCalendarEventId("seed-3")),
      title: "福岡出張",
      when: { kind: "timed", start: at, end: at },
    },
    plan,
    proposedAt: at,
    approvedAt: at,
    visibility,
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

const TRANSPORT_LINES = [
  `lines.outbound(value=${TRANSPORT_TEXT})`,
  `lines.inbound(value=${TRANSPORT_TEXT})`,
] as const satisfies readonly string[];

const descriptionOf = (lines: readonly string[]): string => {
  return `description(purpose=福岡出張,lines=${lines.join("\n")})`;
};

describe("writeBackText", () => {
  test("宿ありの出張は宿の名前を description に入れる", () => {
    expect(writeBackText(tripFor({ lodging: LODGING }), t)).toStrictEqual({
      title: "title(destination=福岡)",
      description: descriptionOf([
        ...TRANSPORT_LINES,
        "lines.lodging(value=デモホテル福岡)",
        "lines.total(value=total(amount=57000,currency=MST))",
      ]),
    });
  });

  test("宿なしの出張は noLodging の文言を入れ、飲食とレジャーの行は省く", () => {
    expect(writeBackText(tripFor({}), t)).toStrictEqual({
      title: "title(destination=福岡)",
      description: descriptionOf([
        ...TRANSPORT_LINES,
        "lines.lodging(value=noLodging)",
        "lines.total(value=total(amount=46000,currency=MST))",
      ]),
    });
  });

  test("飲食とレジャーがあれば宿の次にその名前の行を足す", () => {
    expect(
      writeBackText(
        tripFor({ lodging: LODGING, dining: DINING, leisure: LEISURE }),
        t,
      ),
    ).toStrictEqual({
      title: "title(destination=福岡)",
      description: descriptionOf([
        ...TRANSPORT_LINES,
        "lines.lodging(value=デモホテル福岡)",
        "lines.dining(value=博多 居酒屋 大和)",
        "lines.leisure(value=福岡タワー)",
        "lines.total(value=total(amount=60800,currency=MST))",
      ]),
    });
  });

  test("レジャーだけの日帰りは飲食の行を省いてレジャーの行だけを足す", () => {
    expect(writeBackText(tripFor({ leisure: LEISURE }), t)).toStrictEqual({
      title: "title(destination=福岡)",
      description: descriptionOf([
        ...TRANSPORT_LINES,
        "lines.lodging(value=noLodging)",
        "lines.leisure(value=福岡タワー)",
        "lines.total(value=total(amount=46800,currency=MST))",
      ]),
    });
  });
});
