import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tripItems, trips } from "@/db/schema";
import type { ServiceCategory } from "@/features/services/constants";
import type {
  ConfirmedTrip,
  ConfirmedTripItem,
  ConfirmedTripItemStatus,
} from "@/features/trips/confirmed-trip";

/** 確定した旅程を表す `trips.status` の値 (`db-design.md` §6.2) */
const CONFIRMED = "confirmed";

const TRIP_COLUMNS = {
  id: trips.id,
  title: trips.title,
  originCity: trips.originCity,
  destinationCity: trips.destinationCity,
  startDate: trips.startDate,
  endDate: trips.endDate,
};

const ITEM_COLUMNS = {
  id: tripItems.id,
  tripId: tripItems.tripId,
  seq: tripItems.seq,
  category: tripItems.category,
  nameSnapshot: tripItems.nameSnapshot,
  unitPriceJpyc: tripItems.unitPriceJpyc,
  quantity: tripItems.quantity,
  priceJpyc: tripItems.priceJpyc,
  startAt: tripItems.startAt,
  endAt: tripItems.endAt,
  status: tripItems.status,
  bookingRef: tripItems.bookingRef,
};

type ItemRow = {
  id: string;
  tripId: string;
  seq: number;
  category: string;
  nameSnapshot: string;
  unitPriceJpyc: number;
  quantity: number;
  priceJpyc: number;
  startAt: Date | null;
  endAt: Date | null;
  status: string;
  bookingRef: string | null;
};

// 列の値は DB の CHECK で絞られているが、型の上では text なのでここで絞る
const itemOf = (row: ItemRow): ConfirmedTripItem => {
  return {
    id: row.id,
    seq: row.seq,
    category: row.category as ServiceCategory,
    name: row.nameSnapshot,
    unitPriceJpyc: row.unitPriceJpyc,
    quantity: row.quantity,
    priceJpyc: row.priceJpyc,
    startAt: row.startAt === null ? null : row.startAt.toISOString(),
    endAt: row.endAt === null ? null : row.endAt.toISOString(),
    status: row.status as ConfirmedTripItemStatus,
    bookingRef: row.bookingRef,
  };
};

/**
 * 自分の確定した旅程を明細ごと読む
 *
 * 一覧は出発日の新しい順、明細は旅程内の並び順 (`trip_items.seq`)
 * `user_id` は呼び出し側がセッションから決めるので、他人の行には届かない
 */
export async function readConfirmedTrips(
  userId: string,
): Promise<ConfirmedTrip[]> {
  const db = getDb();
  const headers = await db
    .select(TRIP_COLUMNS)
    .from(trips)
    .where(and(eq(trips.userId, userId), eq(trips.status, CONFIRMED)))
    .orderBy(desc(trips.startDate));

  if (headers.length === 0) {
    return [];
  }

  const rows = await db
    .select(ITEM_COLUMNS)
    .from(tripItems)
    .where(
      inArray(
        tripItems.tripId,
        headers.map((header) => header.id),
      ),
    )
    .orderBy(asc(tripItems.tripId), asc(tripItems.seq));

  return headers.map((header) => ({
    ...header,
    items: rows.filter((row) => row.tripId === header.id).map(itemOf),
  }));
}
