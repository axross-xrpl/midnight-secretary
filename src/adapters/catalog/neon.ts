import { and, asc, eq, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { placeServices, transportServices } from "@/db/schema";
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
 * 金額の通貨
 *
 * DB は円単位の JPYC 整数を持つが、`Money` の通貨はデモ用の 2 つしか無い
 * 金額の大きさは同じなので、fake と揃えて MST 建てとして扱う
 */
const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const VERIFICATION_KINDS: readonly string[] = [
  "age",
  "nationality",
  "residence",
];

// DB の CHECK で 3 値に絞られているが、型の上では text[] なのでここで絞る
const verificationsOf = (
  raw: readonly string[],
): readonly VerificationKind[] => {
  return raw.filter((value): value is VerificationKind =>
    VERIFICATION_KINDS.includes(value),
  );
};

// time 型は "HH:MM:SS" で来るので、JST の現地時刻が要る形に切る
const hourMinute = (value: string): string => {
  return value.slice(0, 5);
};

const offerId = (code: string): OfferId => {
  return mustParse(parseOfferId(code));
};

const payeeOf = (walletAddress: string): WalletAddress => {
  return mustParse(parseWalletAddress(walletAddress));
};

const optional = <T>(value: T | null): T | undefined => {
  return value === null ? undefined : value;
};

type TransportRow = {
  code: string;
  name: string;
  mode: string;
  fromSpot: string;
  toSpot: string;
  departTime: string | null;
  arriveTime: string | null;
  durationMin: number;
  priceJpyc: number;
  originAccessMin: number;
  boardingBufferMin: number;
  arrivalBufferMin: number | null;
  destinationAccessMin: number;
  accessFareJpyc: number | null;
  walletAddress: string;
};

type PlaceRow = {
  code: string;
  kind: string;
  name: string;
  city: string;
  genre: string | null;
  priceJpyc: number;
  requiredVerifications: string[];
  rating: number | null;
  ageLimit: number | null;
  walletAddress: string;
};

/**
 * 拠点から目的地までの所要と総額
 *
 * 内訳は交通の行が自己完結して持つので、移動条件のテーブルを引かない
 */
const doorToDoorOf = (row: TransportRow): DoorToDoor => {
  return {
    totalMin:
      row.originAccessMin +
      row.boardingBufferMin +
      row.durationMin +
      (row.arrivalBufferMin ?? 0) +
      row.destinationAccessMin,
    totalPrice: mst(row.priceJpyc + (row.accessFareJpyc ?? 0)),
  };
};

/**
 * 交通 1 行を候補にする
 *
 * 時刻を持たない行は旅程に置けないので候補から外す
 * `vendor` は DB に列が無い (事業者マスタを持たない設計) ので名称をそのまま使う
 */
const transportOfferOn = (
  row: TransportRow,
  date: IsoDate,
): TransportOffer | undefined => {
  if (row.departTime === null || row.arriveTime === null) {
    return undefined;
  }

  return {
    id: offerId(row.code),
    mode: row.mode as TransportMode,
    vendor: row.name,
    payee: payeeOf(row.walletAddress),
    origin: row.fromSpot,
    destination: row.toSpot,
    departAt: jstDateTimeOf(date, hourMinute(row.departTime)),
    arriveAt: jstDateTimeOf(date, hourMinute(row.arriveTime)),
    price: mst(row.priceJpyc),
    doorToDoor: doorToDoorOf(row),
  };
};

const lodgingOfferFor = (
  row: PlaceRow,
  query: OfferQuery,
  nights: number,
): LodgingOffer => {
  return {
    id: offerId(row.code),
    vendor: row.name,
    payee: payeeOf(row.walletAddress),
    name: row.name,
    city: row.city,
    checkIn: query.departOn,
    checkOut: query.returnOn,
    price: mst(row.priceJpyc * nights),
    ...(row.rating === null ? {} : { rating: row.rating }),
    requiredVerifications: verificationsOf(row.requiredVerifications),
  };
};

const placeOfferOf = (row: PlaceRow, kind: PlaceOfferKind): PlaceOffer => {
  const genre = optional(row.genre);
  const ageLimit = optional(row.ageLimit);

  return {
    id: offerId(row.code),
    kind,
    payee: payeeOf(row.walletAddress),
    name: row.name,
    city: row.city,
    ...(genre === undefined ? {} : { genre }),
    price: mst(row.priceJpyc),
    requiredVerifications: verificationsOf(row.requiredVerifications),
    ...(ageLimit === undefined ? {} : { ageLimit }),
  };
};

const TRANSPORT_COLUMNS = {
  code: transportServices.code,
  name: transportServices.name,
  mode: transportServices.mode,
  fromSpot: transportServices.fromSpot,
  toSpot: transportServices.toSpot,
  departTime: transportServices.departTime,
  arriveTime: transportServices.arriveTime,
  durationMin: transportServices.durationMin,
  priceJpyc: transportServices.priceJpyc,
  originAccessMin: transportServices.originAccessMin,
  boardingBufferMin: transportServices.boardingBufferMin,
  arrivalBufferMin: transportServices.arrivalBufferMin,
  destinationAccessMin: transportServices.destinationAccessMin,
  accessFareJpyc: transportServices.accessFareJpyc,
  walletAddress: transportServices.walletAddress,
};

const PLACE_COLUMNS = {
  code: placeServices.code,
  kind: placeServices.kind,
  name: placeServices.name,
  city: placeServices.city,
  genre: placeServices.genre,
  priceJpyc: placeServices.priceJpyc,
  requiredVerifications: placeServices.requiredVerifications,
  rating: placeServices.rating,
  ageLimit: placeServices.ageLimit,
  walletAddress: placeServices.walletAddress,
};

type Db = ReturnType<typeof getDb>;

/**
 * 利用者が書いた出発地・目的地を、都市名でも地点名でも当てる
 *
 * 出張者の好みは最寄り駅 ("品川") で持ち、DB の行は都市 ("東京") と地点 ("品川") の両方を持つ
 */
const matchesPlace = (city: AnyPgColumn, spot: AnyPgColumn, value: string) => {
  return or(eq(city, value), eq(spot, value));
};

const findTransport = async (
  db: Db,
  origin: string,
  destination: string,
): Promise<readonly TransportRow[]> => {
  return db
    .select(TRANSPORT_COLUMNS)
    .from(transportServices)
    .where(
      and(
        eq(transportServices.active, true),
        matchesPlace(
          transportServices.fromCity,
          transportServices.fromSpot,
          origin,
        ),
        matchesPlace(
          transportServices.toCity,
          transportServices.toSpot,
          destination,
        ),
      ),
    )
    .orderBy(asc(transportServices.code));
};

const findPlaces = async (
  db: Db,
  kind: string,
  city: string,
): Promise<readonly PlaceRow[]> => {
  return db
    .select(PLACE_COLUMNS)
    .from(placeServices)
    .where(
      and(
        eq(placeServices.active, true),
        eq(placeServices.kind, kind),
        eq(placeServices.city, city),
      ),
    )
    .orderBy(asc(placeServices.code));
};

const readDestinations = async (db: Db): Promise<readonly string[]> => {
  const rows = await db
    .selectDistinct({ city: transportServices.toCity })
    .from(transportServices)
    .where(eq(transportServices.active, true))
    .orderBy(asc(transportServices.toCity));

  return rows.map(({ city }) => city);
};

const offerSetFor = async (
  db: Db,
  query: OfferQuery,
): Promise<Result<OfferSet, CatalogError>> => {
  const destinations = await readDestinations(db);

  if (!destinations.includes(query.destination)) {
    return err({ kind: "unknownDestination", destination: query.destination });
  }

  const nights = nightsBetween(query.departOn, query.returnOn);
  const [outbound, inbound, lodging, dining, leisure] = await Promise.all([
    findTransport(db, query.origin, query.destination),
    findTransport(db, query.destination, query.origin),
    nights > 0
      ? findPlaces(db, "hotel", query.destination)
      : Promise.resolve([]),
    findPlaces(db, "restaurant", query.destination),
    findPlaces(db, "leisure", query.destination),
  ]);

  return ok({
    outbound: outbound
      .map((row) => transportOfferOn(row, query.departOn))
      .filter((offer) => offer !== undefined),
    inbound: inbound
      .map((row) => transportOfferOn(row, query.returnOn))
      .filter((offer) => offer !== undefined),
    lodging: lodging.map((row) => lodgingOfferFor(row, query, nights)),
    dining: dining.map((row) => placeOfferOf(row, "restaurant")),
    leisure: leisure.map((row) => placeOfferOf(row, "leisure")),
  });
};

/**
 * NeonDB を読むカタログ
 *
 * 候補はここで閉じた集合にして `PlannerPort` に渡す。LLM は id だけを返し、
 * 価格や存在しない候補が紛れ込むのは `assemblePlan` が止める
 * 無効な行 (`active = false`) は候補に出さない
 */
export const createNeonCatalog = (): FareCatalogPort => {
  return {
    listDestinations: async () => {
      try {
        return ok(await readDestinations(getDb()));
      } catch (cause) {
        return err({ kind: "unavailable", cause });
      }
    },

    findOffers: async (query) => {
      try {
        return await offerSetFor(getDb(), query);
      } catch (cause) {
        return err({ kind: "unavailable", cause });
      }
    },
  };
};
