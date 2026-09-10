import type {
  CatalogError,
  FareCatalogPort,
  LodgingOffer,
  OfferQuery,
  OfferSet,
  TransportMode,
  TransportOffer,
} from "@/domain/catalog";
import { nightsBetween } from "@/domain/dates";
import type { IsoDate, OfferId, WalletAddress } from "@/domain/identifiers";
import {
  mustParse,
  parseAmount,
  parseOfferId,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import type { Money } from "@/domain/money";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { jstDateTimeOf } from "../jst";

/**
 * seed の交通 1 行
 *
 * 時刻は JST の現地時刻で、日付はクエリから取る
 */
export type TransportTemplate = {
  id: OfferId;
  mode: TransportMode;
  vendor: string;
  payee: WalletAddress;
  origin: string;
  destination: string;
  departTime: string;
  arriveTime: string;
  price: Money;
};

/**
 * seed の宿泊 1 行
 *
 * 滞在の料金は 1 泊の料金にクエリの泊数を掛けたもの
 */
export type LodgingTemplate = {
  id: OfferId;
  vendor: string;
  payee: WalletAddress;
  name: string;
  city: string;
  pricePerNight: Money;
};

/**
 * Fake のカタログが返す運賃
 *
 * fake と real のデータが一致するよう、NeonDB の seed を写している
 */
export type FakeCatalogSeed = {
  destinations: readonly string[];
  transport: readonly TransportTemplate[];
  lodging: readonly LodgingTemplate[];
};

const TOKYO = "東京";

const OSAKA = "大阪";

const FUKUOKA = "福岡";

const offerId = (raw: string): OfferId => {
  return mustParse(parseOfferId(raw));
};

const walletAddress = (raw: string): WalletAddress => {
  return mustParse(parseWalletAddress(raw));
};

const demo = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "DEMO" };
};

// 受取先は事業者ごとに 1 つ
// 実物のアドレス形式は Midnight adapter と突き合わせるときに差し替える
const JR_PAYEE = walletAddress("demo-payee-jr");

const ANA_PAYEE = walletAddress("demo-payee-ana");

const HOTELS_PAYEE = walletAddress("demo-payee-hotels");

const transportOfferOn = (
  template: TransportTemplate,
  date: IsoDate,
): TransportOffer => {
  return {
    id: template.id,
    mode: template.mode,
    vendor: template.vendor,
    payee: template.payee,
    origin: template.origin,
    destination: template.destination,
    departAt: jstDateTimeOf(date, template.departTime),
    arriveAt: jstDateTimeOf(date, template.arriveTime),
    price: template.price,
  };
};

const lodgingOfferFor = (
  template: LodgingTemplate,
  query: OfferQuery,
  nights: number,
): LodgingOffer => {
  return {
    id: template.id,
    vendor: template.vendor,
    payee: template.payee,
    name: template.name,
    city: template.city,
    checkIn: query.departOn,
    checkOut: query.returnOn,
    price: {
      amount: mustParse(parseAmount(template.pricePerNight.amount * nights)),
      currency: template.pricePerNight.currency,
    },
  };
};

const lodgingFor = (
  seed: FakeCatalogSeed,
  query: OfferQuery,
  nights: number,
): readonly LodgingOffer[] => {
  if (nights <= 0) {
    return [];
  }

  return seed.lodging
    .filter((template) => template.city === query.destination)
    .map((template) => lodgingOfferFor(template, query, nights));
};

const findOffers = (
  seed: FakeCatalogSeed,
  query: OfferQuery,
): Result<OfferSet, CatalogError> => {
  if (!seed.destinations.includes(query.destination)) {
    return err({ kind: "unknownDestination", destination: query.destination });
  }

  return ok({
    outbound: seed.transport
      .filter(
        (template) =>
          template.origin === query.origin &&
          template.destination === query.destination,
      )
      .map((template) => transportOfferOn(template, query.departOn)),
    inbound: seed.transport
      .filter(
        (template) =>
          template.origin === query.destination &&
          template.destination === query.origin,
      )
      .map((template) => transportOfferOn(template, query.returnOn)),
    lodging: lodgingFor(
      seed,
      query,
      nightsBetween(query.departOn, query.returnOn),
    ),
  });
};

/**
 * 東京発の大阪と福岡の往復で、ホテルはそれぞれ 1 軒
 *
 * 価格はデモ用トークン建てで固定
 * NeonDB の seed と同じ行
 * demo preset に限らず、カタログの port が fake のときは常に使う
 */
export const seedCatalog = (): FakeCatalogSeed => {
  return {
    destinations: [OSAKA, FUKUOKA],
    transport: [
      {
        id: offerId("rail-tokyo-osaka"),
        mode: "rail",
        vendor: "JR",
        payee: JR_PAYEE,
        origin: TOKYO,
        destination: OSAKA,
        departTime: "09:00",
        arriveTime: "11:30",
        price: demo(14720),
      },

      {
        id: offerId("air-tokyo-osaka"),
        mode: "air",
        vendor: "ANA",
        payee: ANA_PAYEE,
        origin: TOKYO,
        destination: OSAKA,
        departTime: "09:30",
        arriveTime: "10:45",
        price: demo(25000),
      },

      {
        id: offerId("rail-osaka-tokyo"),
        mode: "rail",
        vendor: "JR",
        payee: JR_PAYEE,
        origin: OSAKA,
        destination: TOKYO,
        departTime: "18:00",
        arriveTime: "20:30",
        price: demo(14720),
      },

      {
        id: offerId("air-osaka-tokyo"),
        mode: "air",
        vendor: "ANA",
        payee: ANA_PAYEE,
        origin: OSAKA,
        destination: TOKYO,
        departTime: "18:30",
        arriveTime: "19:45",
        price: demo(25000),
      },

      {
        id: offerId("rail-tokyo-fukuoka"),
        mode: "rail",
        vendor: "JR",
        payee: JR_PAYEE,
        origin: TOKYO,
        destination: FUKUOKA,
        departTime: "08:00",
        arriveTime: "13:00",
        price: demo(23000),
      },

      {
        id: offerId("air-tokyo-fukuoka"),
        mode: "air",
        vendor: "ANA",
        payee: ANA_PAYEE,
        origin: TOKYO,
        destination: FUKUOKA,
        departTime: "09:00",
        arriveTime: "11:00",
        price: demo(30000),
      },

      {
        id: offerId("rail-fukuoka-tokyo"),
        mode: "rail",
        vendor: "JR",
        payee: JR_PAYEE,
        origin: FUKUOKA,
        destination: TOKYO,
        departTime: "17:00",
        arriveTime: "22:00",
        price: demo(23000),
      },

      {
        id: offerId("air-fukuoka-tokyo"),
        mode: "air",
        vendor: "ANA",
        payee: ANA_PAYEE,
        origin: FUKUOKA,
        destination: TOKYO,
        departTime: "18:00",
        arriveTime: "20:00",
        price: demo(30000),
      },
    ],
    lodging: [
      {
        id: offerId("hotel-osaka"),
        vendor: "デモホテルズ",
        payee: HOTELS_PAYEE,
        name: "デモホテル大阪",
        city: OSAKA,
        pricePerNight: demo(12000),
      },

      {
        id: offerId("hotel-fukuoka"),
        vendor: "デモホテルズ",
        payee: HOTELS_PAYEE,
        name: "デモホテル福岡",
        city: FUKUOKA,
        pricePerNight: demo(11000),
      },
    ],
  };
};

/**
 * seed を読むだけのカタログ
 *
 * `findOffers` は seed の現地時刻にクエリの日付を当てはめる
 */
export const createFakeCatalog = (seed: FakeCatalogSeed): FareCatalogPort => {
  return {
    listDestinations: async () => ok(seed.destinations),
    findOffers: async (query) => findOffers(seed, query),
  };
};
