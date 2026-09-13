import { describe, expect, test } from "vitest";
import type { LodgingOffer, OfferSet, TransportOffer } from "./catalog";
import type {
  IsoDate,
  IsoDateTime,
  OfferId,
  WalletAddress,
} from "./identifiers";
import {
  mustParse,
  parseAmount,
  parseIsoDate,
  parseIsoDateTime,
  parseOfferId,
  parseWalletAddress,
} from "./identifiers.parse";
import type { Currency, Money } from "./money";
import type { PlanChoice, TripIntent } from "./plan";
import { assemblePlan } from "./plan";

const RATIONALE = "test: first matching offers";

const offerId = (raw: string): OfferId => {
  return mustParse(parseOfferId(raw));
};

const walletAddress = (raw: string): WalletAddress => {
  return mustParse(parseWalletAddress(raw));
};

const date = (raw: string): IsoDate => {
  return mustParse(parseIsoDate(raw));
};

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const money = (amount: number, currency: Currency = "DEMO"): Money => {
  return { amount: mustParse(parseAmount(amount)), currency };
};

const transport = (id: string, price: Money): TransportOffer => {
  return {
    id: offerId(id),
    mode: "rail",
    vendor: "JR",
    payee: walletAddress("demo-payee-jr"),
    origin: "東京",
    destination: "大阪",
    departAt: at("2026-09-14T09:00:00+09:00"),
    arriveAt: at("2026-09-14T11:30:00+09:00"),
    price,
  };
};

const lodging = (id: string, price: Money): LodgingOffer => {
  return {
    id: offerId(id),
    vendor: "デモホテルズ",
    payee: walletAddress("demo-payee-hotels"),
    name: "デモホテル大阪",
    city: "大阪",
    checkIn: date("2026-09-14"),
    checkOut: date("2026-09-15"),
    price,
  };
};

const intentOn = (departOn: string, returnOn: string): TripIntent => {
  return {
    destination: "大阪",
    departOn: date(departOn),
    returnOn: date(returnOn),
    purpose: "取引先訪問",
  };
};

const choiceOf = (
  outboundId: string,
  inboundId: string,
  lodgingId?: string,
): PlanChoice => {
  return {
    outboundId: offerId(outboundId),
    inboundId: offerId(inboundId),
    ...(lodgingId === undefined ? {} : { lodgingId: offerId(lodgingId) }),
    rationale: RATIONALE,
  };
};

const OUTBOUND = transport("rail-out", money(14720));

const INBOUND = transport("rail-in", money(14720));

const HOTEL = lodging("hotel-osaka", money(12000));

const OFFERS: OfferSet = {
  outbound: [OUTBOUND],
  inbound: [INBOUND],
  lodging: [HOTEL],
  dining: [],
  leisure: [],
};

const ONE_NIGHT = intentOn("2026-09-14", "2026-09-15");

const SAME_DAY = intentOn("2026-09-14", "2026-09-14");

describe("assemblePlan", () => {
  test("往路と復路と宿を解決して合計を出す", () => {
    expect(
      assemblePlan(
        ONE_NIGHT,
        OFFERS,
        choiceOf("rail-out", "rail-in", "hotel-osaka"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: true,
      value: {
        intent: ONE_NIGHT,
        outbound: OUTBOUND,
        inbound: INBOUND,
        lodging: HOTEL,
        total: money(41440),
        rationale: RATIONALE,
      },
    });
  });

  test("日帰りは宿なしで合計が交通だけになる", () => {
    expect(
      assemblePlan(
        SAME_DAY,
        OFFERS,
        choiceOf("rail-out", "rail-in"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: true,
      value: {
        intent: SAME_DAY,
        outbound: OUTBOUND,
        inbound: INBOUND,
        total: money(29440),
        rationale: RATIONALE,
      },
    });
  });

  test("往路 id が集合に無いと unknownOffer になる", () => {
    expect(
      assemblePlan(
        SAME_DAY,
        OFFERS,
        choiceOf("air-out", "rail-in"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "unknownOffer", offerId: "air-out" },
    });
  });

  test("復路 id が集合に無いと unknownOffer になる", () => {
    expect(
      assemblePlan(
        SAME_DAY,
        OFFERS,
        choiceOf("rail-out", "air-in"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "unknownOffer", offerId: "air-in" },
    });
  });

  test("宿 id が集合に無いと unknownOffer になる", () => {
    expect(
      assemblePlan(
        ONE_NIGHT,
        OFFERS,
        choiceOf("rail-out", "rail-in", "hotel-kyoto"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "unknownOffer", offerId: "hotel-kyoto" },
    });
  });

  test("1 泊で宿を選んでいないと lodgingRequired になる", () => {
    expect(
      assemblePlan(
        ONE_NIGHT,
        OFFERS,
        choiceOf("rail-out", "rail-in"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "lodgingRequired", nights: 1 },
    });
  });

  test("日帰りで宿を選ぶと lodgingNotAllowed になる", () => {
    expect(
      assemblePlan(
        SAME_DAY,
        OFFERS,
        choiceOf("rail-out", "rail-in", "hotel-osaka"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "lodgingNotAllowed" },
    });
  });

  test("合計が予算を超えると overBudget になる", () => {
    expect(
      assemblePlan(
        ONE_NIGHT,
        OFFERS,
        choiceOf("rail-out", "rail-in", "hotel-osaka"),
        money(30000),
      ),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "overBudget",
        budget: money(30000),
        total: money(41440),
      },
    });
  });

  test("合計が予算とちょうど同額なら通る", () => {
    const assembled = assemblePlan(
      ONE_NIGHT,
      OFFERS,
      choiceOf("rail-out", "rail-in", "hotel-osaka"),
      money(41440),
    );

    expect(assembled.ok).toBe(true);
  });

  test("通貨が混ざると currencyMismatch になる", () => {
    const nightInbound = transport("night-in", money(14720, "NIGHT"));

    expect(
      assemblePlan(
        SAME_DAY,
        { ...OFFERS, inbound: [nightInbound] },
        choiceOf("rail-out", "night-in"),
        money(100000),
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "currencyMismatch", expected: "DEMO", actual: "NIGHT" },
    });
  });
});
