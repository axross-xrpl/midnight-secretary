import type {
  CatalogError,
  DoorToDoor,
  FareCatalogPort,
  LodgingOffer,
  OfferQuery,
  OfferSet,
  PlaceOffer,
  PlaceOfferKind,
  TransportMode,
  TransportOffer,
  VerificationKind,
} from "@/domain/catalog";
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
import { jstDateTimeOf, nightsBetween } from "../jst";

/**
 * seed の交通 1 行
 *
 * 列は `transport_services` と同じ。時刻は JST の現地時刻で、日付はクエリから取る
 * door-to-door の内訳を持つので、real と同じ所要と総額を出せる
 */
export type TransportTemplate = {
  code: string;
  name: string;
  mode: TransportMode;
  fromCity: string;
  toCity: string;
  fromSpot: string;
  toSpot: string;
  departTime: string;
  arriveTime: string;
  durationMin: number;
  priceJpyc: number;
  originAccessMin: number;
  boardingBufferMin: number;
  arrivalBufferMin: number;
  destinationAccessMin: number;
  accessFareJpyc: number;
};

/**
 * seed の宿泊 1 行
 *
 * 滞在の料金は 1 泊の料金にクエリの泊数を掛けたもの
 */
export type LodgingTemplate = {
  code: string;
  name: string;
  city: string;
  pricePerNightJpyc: number;
  rating: number;
  requiredVerifications: readonly VerificationKind[];
};

/**
 * seed の現地サービス 1 行 (飲食・レジャー)
 *
 * 価格は 1 人 / 1 枚あたりで、滞在の日数は掛けない
 */
export type PlaceTemplate = {
  code: string;
  kind: PlaceOfferKind;
  name: string;
  city: string;
  genre: string;
  priceJpyc: number;
  requiredVerifications: readonly VerificationKind[];
  ageLimit?: number;
};

/**
 * Fake のカタログが返す運賃
 *
 * fake と real の結果が揃うよう、NeonDB の有効な行をそのまま写している
 */
export type FakeCatalogSeed = {
  destinations: readonly string[];
  transport: readonly TransportTemplate[];
  lodging: readonly LodgingTemplate[];
  places: readonly PlaceTemplate[];
};

// 受取先は売り手側の 2 つ。DB の行と同じダミー値を使う
const TRANSPORT_PAYEE = "mn_shield-addr_test1demo-transport-seller";

const SERVICE_PAYEE = "mn_shield-addr_test1demo-service-seller";

const offerId = (code: string): OfferId => {
  return mustParse(parseOfferId(code));
};

const payeeOf = (raw: string): WalletAddress => {
  return mustParse(parseWalletAddress(raw));
};

/**
 * 金額の通貨
 *
 * DB は円単位の JPYC 整数を持つが、`Money` の通貨はデモ用の 2 つしか無い
 * real と揃えて DEMO 建てとして扱う
 */
const demo = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "DEMO" };
};

const doorToDoorOf = (template: TransportTemplate): DoorToDoor => {
  return {
    totalMin:
      template.originAccessMin +
      template.boardingBufferMin +
      template.durationMin +
      template.arrivalBufferMin +
      template.destinationAccessMin,
    totalPrice: demo(template.priceJpyc + template.accessFareJpyc),
  };
};

const transportOfferOn = (
  template: TransportTemplate,
  date: IsoDate,
): TransportOffer => {
  return {
    id: offerId(template.code),
    mode: template.mode,
    // DB は事業者の列を持たないので、real と同じく名称をそのまま使う
    vendor: template.name,
    payee: payeeOf(TRANSPORT_PAYEE),
    origin: template.fromSpot,
    destination: template.toSpot,
    departAt: jstDateTimeOf(date, template.departTime),
    arriveAt: jstDateTimeOf(date, template.arriveTime),
    price: demo(template.priceJpyc),
    doorToDoor: doorToDoorOf(template),
  };
};

const lodgingOfferFor = (
  template: LodgingTemplate,
  query: OfferQuery,
  nights: number,
): LodgingOffer => {
  return {
    id: offerId(template.code),
    vendor: template.name,
    payee: payeeOf(SERVICE_PAYEE),
    name: template.name,
    city: template.city,
    checkIn: query.departOn,
    checkOut: query.returnOn,
    price: demo(template.pricePerNightJpyc * nights),
    rating: template.rating,
    requiredVerifications: template.requiredVerifications,
  };
};

const placeOfferOf = (template: PlaceTemplate): PlaceOffer => {
  return {
    id: offerId(template.code),
    kind: template.kind,
    payee: payeeOf(SERVICE_PAYEE),
    name: template.name,
    city: template.city,
    genre: template.genre,
    price: demo(template.priceJpyc),
    requiredVerifications: template.requiredVerifications,
    ...(template.ageLimit === undefined ? {} : { ageLimit: template.ageLimit }),
  };
};

/**
 * 出発地・目的地を都市名でも地点名でも当てる
 *
 * 出張者の好みは最寄り駅 ("品川") で持ち、行は都市 ("東京") と地点 ("品川") の両方を持つ
 * real の adapter と同じ当て方にして、fake と結果を揃える
 */
const matchesPlaceName = (
  city: string,
  spot: string,
  value: string,
): boolean => {
  return city === value || spot === value;
};

const transportBetween = (
  seed: FakeCatalogSeed,
  origin: string,
  destination: string,
  date: IsoDate,
): readonly TransportOffer[] => {
  return seed.transport
    .filter(
      (template) =>
        matchesPlaceName(template.fromCity, template.fromSpot, origin) &&
        matchesPlaceName(template.toCity, template.toSpot, destination),
    )
    .map((template) => transportOfferOn(template, date));
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

const placesFor = (
  seed: FakeCatalogSeed,
  kind: PlaceOfferKind,
  city: string,
): readonly PlaceOffer[] => {
  return seed.places
    .filter((template) => template.kind === kind && template.city === city)
    .map(placeOfferOf);
};

const findOffers = (
  seed: FakeCatalogSeed,
  query: OfferQuery,
): Result<OfferSet, CatalogError> => {
  if (!seed.destinations.includes(query.destination)) {
    return err({ kind: "unknownDestination", destination: query.destination });
  }

  const nights = nightsBetween(query.departOn, query.returnOn);

  return ok({
    outbound: transportBetween(
      seed,
      query.origin,
      query.destination,
      query.departOn,
    ),
    inbound: transportBetween(
      seed,
      query.destination,
      query.origin,
      query.returnOn,
    ),
    lodging: lodgingFor(seed, query, nights),
    dining: placesFor(seed, "restaurant", query.destination),
    leisure: placesFor(seed, "leisure", query.destination),
  });
};

/**
 * NeonDB の有効な行を写した seed
 *
 * DB を用意せずに動かすためのもので、カタログの port が fake のときに常に使う
 * 行を足すときは DB 側の seed と同じ値にする。ずれると fake と real で提案が変わる
 */
export const seedCatalog = (): FakeCatalogSeed => {
  return {
    destinations: ["大阪", "東京"],

    transport: [
      {
        code: "air-ana-017",
        name: "ANA 017便",
        mode: "air",
        fromCity: "東京",
        toCity: "大阪",
        fromSpot: "HND",
        toSpot: "ITM",
        departTime: "07:00",
        arriveTime: "08:15",
        durationMin: 75,
        priceJpyc: 13000,
        originAccessMin: 50,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 30,
        accessFareJpyc: 1350,
      },
      {
        code: "air-ana-038",
        name: "ANA 038便",
        mode: "air",
        fromCity: "大阪",
        toCity: "東京",
        fromSpot: "ITM",
        toSpot: "HND",
        departTime: "18:00",
        arriveTime: "19:15",
        durationMin: 75,
        priceJpyc: 13000,
        originAccessMin: 30,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 50,
        accessFareJpyc: 1350,
      },
      {
        code: "air-jal-105",
        name: "JAL 105便",
        mode: "air",
        fromCity: "東京",
        toCity: "大阪",
        fromSpot: "HND",
        toSpot: "ITM",
        departTime: "08:00",
        arriveTime: "09:15",
        durationMin: 75,
        priceJpyc: 12600,
        originAccessMin: 50,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 30,
        accessFareJpyc: 1350,
      },
      {
        code: "air-jjp-201",
        name: "Jetstar 201便",
        mode: "air",
        fromCity: "東京",
        toCity: "大阪",
        fromSpot: "NRT",
        toSpot: "KIX",
        departTime: "09:30",
        arriveTime: "11:00",
        durationMin: 90,
        priceJpyc: 7800,
        originAccessMin: 95,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 55,
        accessFareJpyc: 4460,
      },
      {
        code: "rail-hikari-505",
        name: "JR東海道新幹線 ひかり505号",
        mode: "rail",
        fromCity: "東京",
        toCity: "大阪",
        fromSpot: "東京",
        toSpot: "新大阪",
        departTime: "08:33",
        arriveTime: "11:30",
        durationMin: 177,
        priceJpyc: 14400,
        originAccessMin: 25,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFareJpyc: 660,
      },
      {
        code: "rail-nozomi-215",
        name: "JR東海道新幹線 のぞみ215号",
        mode: "rail",
        fromCity: "東京",
        toCity: "大阪",
        fromSpot: "東京",
        toSpot: "新大阪",
        departTime: "09:00",
        arriveTime: "11:30",
        durationMin: 150,
        priceJpyc: 14720,
        originAccessMin: 25,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFareJpyc: 660,
      },
      {
        code: "rail-nozomi-221",
        name: "JR東海道新幹線 のぞみ221号",
        mode: "rail",
        fromCity: "東京",
        toCity: "大阪",
        fromSpot: "品川",
        toSpot: "新大阪",
        departTime: "10:00",
        arriveTime: "12:27",
        durationMin: 147,
        priceJpyc: 14520,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFareJpyc: 490,
      },
      {
        code: "rail-nozomi-221-green",
        name: "JR東海道新幹線 のぞみ221号 グリーン車",
        mode: "rail",
        fromCity: "東京",
        toCity: "大阪",
        fromSpot: "品川",
        toSpot: "新大阪",
        departTime: "10:00",
        arriveTime: "12:27",
        durationMin: 147,
        priceJpyc: 19590,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFareJpyc: 490,
      },
      {
        code: "rail-nozomi-232",
        name: "JR東海道新幹線 のぞみ232号",
        mode: "rail",
        fromCity: "大阪",
        toCity: "東京",
        fromSpot: "新大阪",
        toSpot: "品川",
        departTime: "15:00",
        arriveTime: "17:27",
        durationMin: 147,
        priceJpyc: 14520,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFareJpyc: 490,
      },
      {
        code: "rail-nozomi-246",
        name: "JR東海道新幹線 のぞみ246号",
        mode: "rail",
        fromCity: "大阪",
        toCity: "東京",
        fromSpot: "新大阪",
        toSpot: "東京",
        departTime: "18:00",
        arriveTime: "20:33",
        durationMin: 153,
        priceJpyc: 14720,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 25,
        accessFareJpyc: 660,
      },
    ],

    lodging: [
      {
        code: "hotel-namba-c",
        name: "なんばホテルC",
        city: "大阪",
        pricePerNightJpyc: 12500,
        rating: 4,
        requiredVerifications: [],
      },
      {
        code: "hotel-osaka-a",
        name: "ホテルA 大阪梅田",
        city: "大阪",
        pricePerNightJpyc: 8000,
        rating: 3.5,
        requiredVerifications: [],
      },
      {
        code: "hotel-osaka-b",
        name: "ホテルB 大阪梅田",
        city: "大阪",
        pricePerNightJpyc: 16000,
        rating: 4.3,
        requiredVerifications: [],
      },
      {
        code: "hotel-osakabay-inbound",
        name: "ホテル大阪ベイF",
        city: "大阪",
        pricePerNightJpyc: 9800,
        rating: 4.5,
        requiredVerifications: ["nationality"],
      },
      {
        code: "hotel-shinsaibashi-d",
        name: "心斎橋ビジネスホテルD",
        city: "大阪",
        pricePerNightJpyc: 6800,
        rating: 3.2,
        requiredVerifications: [],
      },
      {
        code: "hotel-tennoji-resident",
        name: "天王寺ホテルE",
        city: "大阪",
        pricePerNightJpyc: 5500,
        rating: 3.8,
        requiredVerifications: ["residence"],
      },
      {
        code: "hotel-universalport-g",
        name: "ユニバーサルポートホテルG",
        city: "大阪",
        pricePerNightJpyc: 22000,
        rating: 4.1,
        requiredVerifications: [],
      },
    ],

    places: [
      {
        code: "restaurant-bar-akari",
        kind: "restaurant",
        name: "なんば オーセンティックバー 燈",
        city: "大阪",
        genre: "バー",
        priceJpyc: 6000,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "restaurant-cafe-nakanoshima",
        kind: "restaurant",
        name: "中之島カフェ",
        city: "大阪",
        genre: "カフェ",
        priceJpyc: 1200,
        requiredVerifications: [],
      },
      {
        code: "restaurant-chinese-chinka",
        kind: "restaurant",
        name: "中華料理 陳家",
        city: "大阪",
        genre: "中華",
        priceJpyc: 8000,
        requiredVerifications: [],
      },
      {
        code: "restaurant-chinese-tenshin",
        kind: "restaurant",
        name: "中華 天心",
        city: "大阪",
        genre: "中華",
        priceJpyc: 2200,
        requiredVerifications: [],
      },
      {
        code: "restaurant-craftbeer-nakazaki",
        kind: "restaurant",
        name: "中崎町クラフトビール醸造所",
        city: "大阪",
        genre: "ビール",
        priceJpyc: 4500,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "restaurant-izakaya-tenma",
        kind: "restaurant",
        name: "天満 立ち飲み居酒屋 大和",
        city: "大阪",
        genre: "居酒屋",
        priceJpyc: 3000,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "restaurant-kaiseki-matsukaze",
        kind: "restaurant",
        name: "難波 会席 松風（免税対応）",
        city: "大阪",
        genre: "和食",
        priceJpyc: 12000,
        requiredVerifications: ["nationality"],
      },
      {
        code: "restaurant-okonomiyaki-fuku",
        kind: "restaurant",
        name: "お好み焼き 福",
        city: "大阪",
        genre: "粉もん",
        priceJpyc: 1800,
        requiredVerifications: [],
      },
      {
        code: "restaurant-sushi-takumi",
        kind: "restaurant",
        name: "北新地 寿司 匠",
        city: "大阪",
        genre: "和食",
        priceJpyc: 15000,
        requiredVerifications: [],
      },
      {
        code: "restaurant-takoyaki-honpo",
        kind: "restaurant",
        name: "道頓堀 たこ焼き本舗",
        city: "大阪",
        genre: "粉もん",
        priceJpyc: 800,
        requiredVerifications: [],
      },
      {
        code: "leisure-inbound-guide-tour",
        kind: "leisure",
        name: "訪日外国人限定 大阪ガイドツアー",
        city: "大阪",
        genre: "tour",
        priceJpyc: 3500,
        requiredVerifications: ["nationality"],
      },
      {
        code: "leisure-kaiyukan",
        kind: "leisure",
        name: "海遊館",
        city: "大阪",
        genre: "aquarium",
        priceJpyc: 2700,
        requiredVerifications: [],
      },
      {
        code: "leisure-kyocera-baseball",
        kind: "leisure",
        name: "京セラドーム大阪 野球観戦",
        city: "大阪",
        genre: "baseball",
        priceJpyc: 5500,
        requiredVerifications: [],
      },
      {
        code: "leisure-nakanoshima-museum",
        kind: "leisure",
        name: "大阪中之島美術館",
        city: "大阪",
        genre: "art",
        priceJpyc: 1800,
        requiredVerifications: [],
      },
      {
        code: "leisure-namba-night-theater",
        kind: "leisure",
        name: "ミナミ ナイトシアター 深夜公演（18歳以上）",
        city: "大阪",
        genre: "show",
        priceJpyc: 6500,
        requiredVerifications: ["age"],
        ageLimit: 18,
      },
      {
        code: "leisure-osaka-castle",
        kind: "leisure",
        name: "大阪城天守閣",
        city: "大阪",
        genre: "history",
        priceJpyc: 600,
        requiredVerifications: [],
      },
      {
        code: "leisure-osaka-city-museum",
        kind: "leisure",
        name: "大阪市立美術館",
        city: "大阪",
        genre: "art",
        priceJpyc: 1400,
        requiredVerifications: [],
      },
      {
        code: "leisure-osaka-resident-pass",
        kind: "leisure",
        name: "大阪周遊パス（大阪府民割引）",
        city: "大阪",
        genre: "sightseeing",
        priceJpyc: 2000,
        requiredVerifications: ["residence"],
      },
      {
        code: "leisure-umeda-burlesque",
        kind: "leisure",
        name: "大阪バーレスクショー（20歳以上・ドリンク付）",
        city: "大阪",
        genre: "show",
        priceJpyc: 8800,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "leisure-yodoko-soccer",
        kind: "leisure",
        name: "ヨドコウ桜スタジアム サッカー観戦",
        city: "大阪",
        genre: "soccer",
        priceJpyc: 4200,
        requiredVerifications: [],
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
