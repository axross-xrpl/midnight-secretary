import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { placeServices, transportServices } from "@/db/schema";
import type {
  CatalogError,
  FareCatalogPort,
  OfferQuery,
  OfferSet,
} from "@/domain/catalog";
import { nightsBetween } from "@/domain/dates";
import type { OfferId } from "@/domain/identifiers";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type { PlaceRow, TransportRow } from "./offers";
import { lodgingOfferFor, placeOfferOf, transportOfferOn } from "./offers";

const TRANSPORT_COLUMNS = {
  code: transportServices.code,
  name: transportServices.name,
  mode: transportServices.mode,
  fromSpot: transportServices.fromSpot,
  toSpot: transportServices.toSpot,
  departTime: transportServices.departTime,
  arriveTime: transportServices.arriveTime,
  durationMin: transportServices.durationMin,
  price: transportServices.price,
  originAccessMin: transportServices.originAccessMin,
  boardingBufferMin: transportServices.boardingBufferMin,
  arrivalBufferMin: transportServices.arrivalBufferMin,
  destinationAccessMin: transportServices.destinationAccessMin,
  accessFare: transportServices.accessFare,
  walletAddress: transportServices.walletAddress,
};

const PLACE_COLUMNS = {
  code: placeServices.code,
  kind: placeServices.kind,
  name: placeServices.name,
  city: placeServices.city,
  genre: placeServices.genre,
  price: placeServices.price,
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

// 交通と場 (宿・飲食・レジャー) は別の表なので、両方を code で引いて 1 つの対応表にする
const readServiceIds = async (
  db: Db,
  codes: readonly OfferId[],
): Promise<readonly { code: string; id: string }[]> => {
  const [transport, places] = await Promise.all([
    db
      .select({ code: transportServices.code, id: transportServices.id })
      .from(transportServices)
      .where(inArray(transportServices.code, [...codes])),
    db
      .select({ code: placeServices.code, id: placeServices.id })
      .from(placeServices)
      .where(inArray(placeServices.code, [...codes])),
  ]);

  return [...transport, ...places];
};

const serviceIdsFor = async (
  db: Db,
  codes: readonly OfferId[],
): Promise<Result<Record<OfferId, string>, CatalogError>> => {
  const rows = await readServiceIds(db, codes);
  const resolved: Record<OfferId, string> = Object.fromEntries(
    rows.map((row) => [row.code, row.id]),
  );
  const missing = codes.filter((code) => resolved[code] === undefined);

  if (missing.length > 0) {
    // 「引けない code」に対応する kind が無いので、原因を添えて unavailable にする
    return err({
      kind: "unavailable",
      cause: { reason: "unknownServiceCodes", codes: missing },
    });
  }

  return ok(resolved);
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

    resolveServiceIds: async (codes) => {
      try {
        return await serviceIdsFor(getDb(), codes);
      } catch (cause) {
        return err({ kind: "unavailable", cause });
      }
    },
  };
};
