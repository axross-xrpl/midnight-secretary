import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tripItems, trips } from "@/db/schema";
import type { CatalogError, ResolveServiceId } from "@/domain/catalog";
import type { OfferId, TripId, UserId } from "@/domain/identifiers";
import type { ConfirmedTrip, SecretaryStore, StoreError } from "@/domain/store";
import type { WrittenTrip } from "@/domain/trip";
import type { Result } from "@/lib/result";
import { all, err, ok } from "@/lib/result";
import type { ConfirmedTripItemRow, ConfirmedTripRow } from "./trip-rows";
import { confirmedTripOf, tripItemRowsOf, tripRowOf } from "./trip-rows";

/**
 * Neon の store を組み立てるときに渡すもの
 *
 * 進行中の出張と mandate のリンクはまだメモリに置くので、その store を委譲先として受け取る
 */
export type NeonStoreDeps = {
  memory: SecretaryStore;
};

type Db = ReturnType<typeof getDb>;

const TRIP_COLUMNS = {
  id: trips.id,
  title: trips.title,
  originCity: trips.originCity,
  destinationCity: trips.destinationCity,
  startDate: trips.startDate,
  endDate: trips.endDate,
  sourceEventId: trips.sourceEventId,
  createdAt: trips.createdAt,
};

const ITEM_COLUMNS = {
  tripId: tripItems.tripId,
  seq: tripItems.seq,
  category: tripItems.category,
  serviceId: tripItems.serviceId,
  nameSnapshot: tripItems.nameSnapshot,
  price: tripItems.price,
  payeeSnapshot: tripItems.payeeSnapshot,
  startAt: tripItems.startAt,
  endAt: tripItems.endAt,
  googleEventId: tripItems.googleEventId,
};

const unavailable = (cause: unknown): StoreError => {
  return { kind: "unavailable", cause };
};

// catalog の失敗を store の失敗にする (schema はそのまま、それ以外は原因ごと unavailable に包む)
const fromCatalog = (error: CatalogError): StoreError => {
  if (error.kind === "schema") {
    return error;
  }

  return unavailable(error);
};

// DB の null は境界で undefined にする
const optional = <T>(value: T | null): T | undefined => {
  return value === null ? undefined : value;
};

// undefined のフィールドは行から落とす (exactOptionalPropertyTypes の形に合わせる)
const withOptional = <T>(
  key: string,
  value: T | null,
): Readonly<Record<string, T>> => {
  const present = optional(value);

  if (present === undefined) {
    return {};
  }

  return { [key]: present };
};

type SelectedTrip = {
  id: string;
  title: string;
  originCity: string;
  destinationCity: string;
  startDate: string;
  endDate: string | null;
  sourceEventId: string | null;
  createdAt: Date;
};

type SelectedItem = {
  tripId: string;
  seq: number;
  category: string;
  serviceId: string;
  nameSnapshot: string;
  price: number;
  payeeSnapshot: string;
  startAt: Date | null;
  endAt: Date | null;
  googleEventId: string | null;
};

const tripRowFrom = (row: SelectedTrip): ConfirmedTripRow => {
  return {
    id: row.id,
    title: row.title,
    originCity: row.originCity,
    destinationCity: row.destinationCity,
    startDate: row.startDate,
    ...withOptional("endDate", row.endDate),
    ...withOptional("sourceEventId", row.sourceEventId),
    createdAt: row.createdAt,
  };
};

const itemRowFrom = (row: SelectedItem): ConfirmedTripItemRow => {
  return {
    seq: row.seq,
    category: row.category,
    serviceId: row.serviceId,
    nameSnapshot: row.nameSnapshot,
    price: row.price,
    payeeSnapshot: row.payeeSnapshot,
    ...withOptional("startAt", row.startAt),
    ...withOptional("endAt", row.endAt),
    ...withOptional("googleEventId", row.googleEventId),
  };
};

const readConfirmed = async (
  db: Db,
  userId: UserId,
): Promise<Result<readonly ConfirmedTrip[], StoreError>> => {
  const tripRows: readonly SelectedTrip[] = await db
    .select(TRIP_COLUMNS)
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(desc(trips.startDate));

  if (tripRows.length === 0) {
    return ok([]);
  }

  const itemRows: readonly SelectedItem[] = await db
    .select(ITEM_COLUMNS)
    .from(tripItems)
    .where(
      inArray(
        tripItems.tripId,
        tripRows.map((row) => row.id),
      ),
    )
    .orderBy(asc(tripItems.seq));

  return all(
    tripRows.map((row) =>
      confirmedTripOf(
        tripRowFrom(row),
        itemRows.filter((item) => item.tripId === row.id).map(itemRowFrom),
      ),
    ),
  );
};

const isStored = async (
  db: Db,
  userId: UserId,
  tripId: TripId,
): Promise<boolean> => {
  const [row] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.userId, userId), eq(trips.id, tripId)))
    .limit(1);

  return row !== undefined;
};

const offerIdsOf = (trip: WrittenTrip): readonly OfferId[] => {
  const plan = trip.plan;

  return [
    plan.outbound.id,
    plan.inbound.id,
    ...(plan.lodging === undefined ? [] : [plan.lodging.id]),
    ...(plan.dining === undefined ? [] : [plan.dining.id]),
    ...(plan.leisure === undefined ? [] : [plan.leisure.id]),
  ];
};

const insertConfirmed = async (
  db: Db,
  userId: UserId,
  trip: WrittenTrip,
  resolveServiceId: ResolveServiceId,
): Promise<Result<void, StoreError>> => {
  if (await isStored(db, userId, trip.id)) {
    return ok(undefined);
  }

  const serviceIds = await resolveServiceId(offerIdsOf(trip));

  if (!serviceIds.ok) {
    return err(fromCatalog(serviceIds.error));
  }

  const itemRows = tripItemRowsOf(trip, serviceIds.value);

  if (!itemRows.ok) {
    return itemRows;
  }

  // ヘッダと明細は 1 つの batch で書く (neon-http は transaction を持たないが batch は 1 トランザクションになる)
  // 別々に書くと明細の失敗でヘッダだけが残り、冪等の判定がその旅程を明細 0 件のまま固定してしまう
  await db.batch([
    db.insert(trips).values(tripRowOf(userId, trip)),
    db.insert(tripItems).values([...itemRows.value]),
  ]);

  return ok(undefined);
};

/**
 * 確定旅程だけを NeonDB に写す store
 *
 * 進行中の出張 (提案済み / 承認済み / 支払い済み) と mandate のリンクは `deps.memory` に委ねる
 * `trips` / `trip_items` の表は「確定した予約のスナップショット」なので、書き戻しが済んだ出張だけを写す
 */
export const createNeonStore = (deps: NeonStoreDeps): SecretaryStore => {
  return {
    getTrip: deps.memory.getTrip,
    listTrips: deps.memory.listTrips,
    putTrip: deps.memory.putTrip,
    getMandateLink: deps.memory.getMandateLink,
    putMandateLink: deps.memory.putMandateLink,

    // 接続も getDb() の中で起きるので、catalog の adapter と同じく呼び出しごと try で包む
    listConfirmedTrips: async (userId) => {
      try {
        return await readConfirmed(getDb(), userId);
      } catch (cause) {
        return err(unavailable(cause));
      }
    },

    putConfirmedTrip: async (userId, trip, resolveServiceId) => {
      try {
        return await insertConfirmed(getDb(), userId, trip, resolveServiceId);
      } catch (cause) {
        return err(unavailable(cause));
      }
    },
  };
};
