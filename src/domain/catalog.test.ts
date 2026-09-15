import { describe, expect, test } from "vitest";
import type {
  LodgingOffer,
  OfferSet,
  PlaceOffer,
  TransportOffer,
} from "./catalog";
import { withoutAgeRestrictedDining } from "./catalog";
import {
  mustParse,
  parseAmount,
  parseIsoDate,
  parseIsoDateTime,
  parseOfferId,
  parseWalletAddress,
} from "./identifiers.parse";
import type { Money } from "./money";

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const RAIL: TransportOffer = {
  id: mustParse(parseOfferId("rail-tokyo-osaka")),
  mode: "rail",
  vendor: "デモ鉄道",
  payee: mustParse(parseWalletAddress("demo-payee-rail")),
  origin: "東京",
  destination: "大阪",
  departAt: mustParse(parseIsoDateTime("2026-09-14T09:00:00+09:00")),
  arriveAt: mustParse(parseIsoDateTime("2026-09-14T11:30:00+09:00")),
  price: mst(14400),
};

const HOTEL: LodgingOffer = {
  id: mustParse(parseOfferId("hotel-namba-c")),
  vendor: "デモホテルズ",
  payee: mustParse(parseWalletAddress("demo-payee-hotels")),
  name: "なんばホテルC",
  city: "大阪",
  checkIn: mustParse(parseIsoDate("2026-09-14")),
  checkOut: mustParse(parseIsoDate("2026-09-15")),
  price: mst(12500),
};

const IZAKAYA: PlaceOffer = {
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

const CAFE: PlaceOffer = {
  id: mustParse(parseOfferId("restaurant-cafe-nakanoshima")),
  kind: "restaurant",
  payee: mustParse(parseWalletAddress("demo-payee-service")),
  name: "中之島カフェ",
  city: "大阪",
  genre: "カフェ",
  price: mst(1200),
  requiredVerifications: [],
};

// 年齢以外の本人確認を要する飲食 (除かれない)
const KAISEKI: PlaceOffer = {
  id: mustParse(parseOfferId("restaurant-kaiseki-matsukaze")),
  kind: "restaurant",
  payee: mustParse(parseWalletAddress("demo-payee-service")),
  name: "難波 会席 松風",
  city: "大阪",
  genre: "和食",
  price: mst(12000),
  requiredVerifications: ["nationality"],
};

// 年齢確認を要するレジャー (飲食ではないので除かれない)
const BURLESQUE: PlaceOffer = {
  id: mustParse(parseOfferId("leisure-umeda-burlesque")),
  kind: "leisure",
  payee: mustParse(parseWalletAddress("demo-payee-service")),
  name: "梅田 バーレスクシアター",
  city: "大阪",
  genre: "ショー",
  price: mst(5000),
  requiredVerifications: ["age"],
  ageLimit: 20,
};

const OFFERS: OfferSet = {
  outbound: [RAIL],
  inbound: [RAIL],
  lodging: [HOTEL],
  dining: [IZAKAYA, CAFE, KAISEKI],
  leisure: [BURLESQUE],
};

describe("withoutAgeRestrictedDining", () => {
  test("年齢確認を要する飲食だけを除く", () => {
    expect(withoutAgeRestrictedDining(OFFERS).dining).toStrictEqual([
      CAFE,
      KAISEKI,
    ]);
  });

  test("交通、宿泊、レジャーはそのまま残す", () => {
    const remaining = withoutAgeRestrictedDining(OFFERS);

    expect(remaining.outbound).toStrictEqual(OFFERS.outbound);
    expect(remaining.inbound).toStrictEqual(OFFERS.inbound);
    expect(remaining.lodging).toStrictEqual(OFFERS.lodging);
    expect(remaining.leisure).toStrictEqual([BURLESQUE]);
  });

  test("元の候補の集合は変えない", () => {
    withoutAgeRestrictedDining(OFFERS);

    expect(OFFERS.dining).toStrictEqual([IZAKAYA, CAFE, KAISEKI]);
  });

  test("年齢確認を要する飲食しか無ければ飲食は空になる", () => {
    const onlyAgeRestricted: OfferSet = { ...OFFERS, dining: [IZAKAYA] };

    expect(withoutAgeRestrictedDining(onlyAgeRestricted).dining).toStrictEqual(
      [],
    );
  });
});
