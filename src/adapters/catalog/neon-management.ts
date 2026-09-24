import {
  and,
  asc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { placeServices, transportServices } from "@/db/schema";
import type {
  PlaceServiceRow,
  ServiceListFilters,
  ServiceListItem,
  ServiceWriteError,
  TransportServiceRow,
} from "@/domain/catalog";
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import { isTransportCategory } from "@/features/services/constants";
import type {
  PlaceServiceCreateInput,
  PlaceServiceUpdateInput,
  TransportServiceCreateInput,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { postgresErrorCode } from "@/server/pg-error";
import {
  genreOptionsOf,
  homeOptionsOf,
  placeListItemOf,
  placeValuesOf,
  sortedByCategory,
  transportListItemOf,
  transportValuesOf,
} from "./rows";

type Db = ReturnType<typeof getDb>;

const classifyDatabaseError = (
  error: unknown,
): ServiceWriteError | undefined => {
  const code = postgresErrorCode(error);

  if (code === "23505") {
    return { kind: "duplicateCode" };
  }

  if (code === "23502" || code === "23514" || code === "22P02") {
    return { kind: "constraintViolation" };
  }

  return undefined;
};

/**
 * 書き込みの失敗を `ServiceWriteError` にする
 *
 * 制約違反は種類ごとの失敗に、それ以外の DB の失敗は原因ごと `unavailable` にする
 */
export const asWriteResult = async <T>(
  operation: () => Promise<Result<T, ServiceWriteError>>,
): Promise<Result<T, ServiceWriteError>> => {
  try {
    return await operation();
  } catch (cause) {
    return err(classifyDatabaseError(cause) ?? { kind: "unavailable", cause });
  }
};

// timestamptz はマイクロ秒まで持つが Date はミリ秒までなので、1ミリ秒の幅で突き合わせる
const millisecondRange = (updatedAt: string) => {
  const start = new Date(updatedAt);

  return { start, end: new Date(start.getTime() + 1) };
};

const transportConditionsOf = (filters: ServiceListFilters): SQL[] => {
  const activeOnly = filters.active !== "all" ? (filters.active ?? true) : null;
  const pattern = filters.query ? `%${filters.query}%` : null;

  return [
    ...(activeOnly === null ? [] : [eq(transportServices.active, activeOnly)]),
    ...(filters.category === undefined
      ? []
      : [eq(transportServices.mode, filters.category)]),
    // 交通は出発・到着のどちらかが一致すればその都市の便として扱う
    ...(filters.city
      ? [
          or(
            eq(transportServices.fromCity, filters.city),
            eq(transportServices.toCity, filters.city),
          ),
        ]
      : []),
    ...(pattern
      ? [
          or(
            ilike(transportServices.name, pattern),
            ilike(transportServices.code, pattern),
            ilike(transportServices.fromSpot, pattern),
            ilike(transportServices.toSpot, pattern),
            ilike(transportServices.fromCity, pattern),
            ilike(transportServices.toCity, pattern),
          ),
        ]
      : []),
  ].filter((condition) => condition !== undefined);
};

const placeConditionsOf = (filters: ServiceListFilters): SQL[] => {
  const activeOnly = filters.active !== "all" ? (filters.active ?? true) : null;
  const pattern = filters.query ? `%${filters.query}%` : null;

  return [
    ...(activeOnly === null ? [] : [eq(placeServices.active, activeOnly)]),
    ...(filters.category === undefined
      ? []
      : [eq(placeServices.kind, filters.category)]),
    ...(filters.city ? [eq(placeServices.city, filters.city)] : []),
    ...(pattern
      ? [
          or(
            ilike(placeServices.name, pattern),
            ilike(placeServices.code, pattern),
            ilike(placeServices.city, pattern),
            ilike(placeServices.nearestStation, pattern),
          ),
        ]
      : []),
  ].filter((condition) => condition !== undefined);
};

/**
 * サービス一覧を読む
 *
 * 一覧の行には最寄り駅と本人確認の要求も出すため、service_catalog ビューではなく
 * 実テーブルを引いて突き合わせる (ビューはこの2列を持たない)
 * 種別で絞ると、片方のテーブルは引く必要が無くなる
 */
export const readServiceList = async (
  db: Db,
  filters: ServiceListFilters,
): Promise<ServiceListItem[]> => {
  const wantsTransport =
    filters.category === undefined || isTransportCategory(filters.category);
  const wantsPlace =
    filters.category === undefined || !isTransportCategory(filters.category);

  const [transportRows, placeRows] = await Promise.all([
    wantsTransport
      ? db
          .select()
          .from(transportServices)
          .where(and(...transportConditionsOf(filters)))
          .orderBy(asc(transportServices.name))
      : Promise.resolve([]),
    wantsPlace
      ? db
          .select()
          .from(placeServices)
          .where(and(...placeConditionsOf(filters)))
          .orderBy(asc(placeServices.name))
      : Promise.resolve([]),
  ]);

  return sortedByCategory([
    ...transportRows.map(transportListItemOf),
    ...placeRows.map(placeListItemOf),
  ]);
};

/**
 * 交通 1 行を id で引く
 */
export const readTransportRow = async (
  db: Db,
  id: string,
): Promise<TransportServiceRow | undefined> => {
  const [service] = await db
    .select()
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);

  return service;
};

/**
 * 場所系 1 行を id で引く
 */
export const readPlaceRow = async (
  db: Db,
  id: string,
): Promise<PlaceServiceRow | undefined> => {
  const [service] = await db
    .select()
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);

  return service;
};

/**
 * 拠点として選べる都市と起点
 *
 * 自由入力にすると交通が1件も当たらない設定を作れてしまうので、
 * 登録済みの交通の有効行から導出する (`register-page-spec.md` §9 と同じ考え方)
 */
export const readHomeOptionRows = async (db: Db): Promise<HomeOption[]> => {
  const rows = await db
    .selectDistinct({
      city: transportServices.fromCity,
      spot: transportServices.fromSpot,
    })
    .from(transportServices)
    .where(eq(transportServices.active, true))
    .orderBy(asc(transportServices.fromCity), asc(transportServices.fromSpot));

  return homeOptionsOf(rows);
};

/**
 * 好み・趣味に選べるジャンル
 *
 * `place_services.genre` と突き合わせるので、選択肢も同じ列から出す
 */
export const readGenreOptionRows = async (db: Db): Promise<GenreOptions> => {
  const rows = await db
    .selectDistinct({
      kind: placeServices.kind,
      genre: placeServices.genre,
    })
    .from(placeServices)
    .where(
      and(
        eq(placeServices.active, true),
        isNotNull(placeServices.genre),
        inArray(placeServices.kind, ["restaurant", "leisure"]),
      ),
    )
    .orderBy(asc(placeServices.genre));

  return genreOptionsOf(rows);
};

export const insertTransport = async (
  db: Db,
  input: TransportServiceCreateInput,
): Promise<Result<TransportServiceRow, ServiceWriteError>> => {
  const [service] = await db
    .insert(transportServices)
    .values({ ...transportValuesOf(input), updatedAt: new Date() })
    .returning();

  return ok(service);
};

export const updateTransport = async (
  db: Db,
  id: string,
  input: TransportServiceUpdateInput,
): Promise<Result<TransportServiceRow, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(input.updatedAt);
  const [service] = await db
    .update(transportServices)
    .set({ ...transportValuesOf(input), updatedAt: new Date() })
    .where(
      and(
        eq(transportServices.id, id),
        eq(transportServices.mode, input.mode),
        gte(transportServices.updatedAt, expectedUpdatedAt.start),
        lt(transportServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();

  if (service) {
    return ok(service);
  }

  const [current] = await db
    .select({ mode: transportServices.mode })
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);

  if (!current) {
    return err({ kind: "notFound" });
  }

  if (current.mode !== input.mode) {
    return err({ kind: "immutableCategory" });
  }

  return err({ kind: "conflict" });
};

export const disableTransport = async (
  db: Db,
  id: string,
  updatedAt: string,
): Promise<Result<TransportServiceRow, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const [service] = await db
    .update(transportServices)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(transportServices.id, id),
        gte(transportServices.updatedAt, expectedUpdatedAt.start),
        lt(transportServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();

  if (service) {
    return ok(service);
  }

  const [current] = await db
    .select({ id: transportServices.id })
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);

  return current ? err({ kind: "conflict" }) : err({ kind: "notFound" });
};

export const insertPlace = async (
  db: Db,
  input: PlaceServiceCreateInput,
): Promise<Result<PlaceServiceRow, ServiceWriteError>> => {
  const [service] = await db
    .insert(placeServices)
    .values({ ...placeValuesOf(input), updatedAt: new Date() })
    .returning();

  return ok(service);
};

export const updatePlace = async (
  db: Db,
  id: string,
  input: PlaceServiceUpdateInput,
): Promise<Result<PlaceServiceRow, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(input.updatedAt);
  const [service] = await db
    .update(placeServices)
    .set({ ...placeValuesOf(input), updatedAt: new Date() })
    .where(
      and(
        eq(placeServices.id, id),
        eq(placeServices.kind, input.kind),
        gte(placeServices.updatedAt, expectedUpdatedAt.start),
        lt(placeServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();

  if (service) {
    return ok(service);
  }

  const [current] = await db
    .select({ kind: placeServices.kind })
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);

  if (!current) {
    return err({ kind: "notFound" });
  }

  if (current.kind !== input.kind) {
    return err({ kind: "immutableCategory" });
  }

  return err({ kind: "conflict" });
};

export const disablePlace = async (
  db: Db,
  id: string,
  updatedAt: string,
): Promise<Result<PlaceServiceRow, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const [service] = await db
    .update(placeServices)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(placeServices.id, id),
        gte(placeServices.updatedAt, expectedUpdatedAt.start),
        lt(placeServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();

  if (service) {
    return ok(service);
  }

  const [current] = await db
    .select({ id: placeServices.id })
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);

  return current ? err({ kind: "conflict" }) : err({ kind: "notFound" });
};
