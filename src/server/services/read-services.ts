import "server-only";

import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { placeServices, transportServices } from "@/db/schema";
import type {
  ServiceCategory,
  VerificationKind,
} from "@/features/services/constants";
import {
  isTransportCategory,
  serviceCategories,
} from "@/features/services/constants";

export { serviceCategories } from "@/features/services/constants";

export type ServiceListFilters = {
  category?: ServiceCategory;
  city?: string;
  query?: string;
  active?: boolean | "all";
};

export type ServiceListItem = {
  id: string;
  category: ServiceCategory;
  code: string;
  name: string;
  price: number;
  /** 交通は区間、場所系は都市 */
  location: string;
  /** 場所系の最寄り駅。交通は null */
  station: string | null;
  /** 最寄り駅からの時間。交通は null */
  stationAccessMin: number | null;
  /** 場所系が要求する本人確認。交通は常に空 */
  requiredVerifications: VerificationKind[];
  ageLimit: number | null;
  active: boolean;
  updatedAt: Date;
};

const categoryOrder = new Map(
  serviceCategories.map((category, index) => [category, index]),
);

/**
 * 種別の並び順
 *
 * 一覧は種別ごとに見出しを付けるので、その順をコードで決めた論理順
 * (鉄道→航空→宿泊→飲食→レジャー) にする
 *
 * 種別の中の並びには触れない。Array#sort は安定なので、各テーブルから
 * 名前順で受け取った行の相対順序がそのまま残る
 */
const compareByCategory = (a: ServiceListItem, b: ServiceListItem): number => {
  return (
    (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0)
  );
};

/**
 * サービス一覧を読む
 *
 * 一覧の行には最寄り駅と本人確認の要求も出すため、service_catalog ビューではなく
 * 実テーブルを引いて突き合わせる (ビューはこの2列を持たない)
 */
export async function readServices(
  filters: ServiceListFilters = {},
): Promise<ServiceListItem[]> {
  const db = getDb();
  const activeOnly = filters.active !== "all" ? (filters.active ?? true) : null;
  const pattern = filters.query ? `%${filters.query}%` : null;

  // 種別で絞ると、片方のテーブルは引く必要が無くなる
  const wantsTransport =
    filters.category === undefined || isTransportCategory(filters.category);
  const wantsPlace =
    filters.category === undefined || !isTransportCategory(filters.category);

  const transportConditions: SQL[] = [];
  const placeConditions: SQL[] = [];

  if (activeOnly !== null) {
    transportConditions.push(eq(transportServices.active, activeOnly));
    placeConditions.push(eq(placeServices.active, activeOnly));
  }

  if (filters.category !== undefined) {
    if (isTransportCategory(filters.category)) {
      transportConditions.push(eq(transportServices.mode, filters.category));
    } else {
      placeConditions.push(eq(placeServices.kind, filters.category));
    }
  }

  if (filters.city) {
    // 交通は出発・到着のどちらかが一致すればその都市の便として扱う
    const transportCity = or(
      eq(transportServices.fromCity, filters.city),
      eq(transportServices.toCity, filters.city),
    );

    if (transportCity) {
      transportConditions.push(transportCity);
    }

    placeConditions.push(eq(placeServices.city, filters.city));
  }

  if (pattern) {
    const transportQuery = or(
      ilike(transportServices.name, pattern),
      ilike(transportServices.code, pattern),
      ilike(transportServices.fromSpot, pattern),
      ilike(transportServices.toSpot, pattern),
      ilike(transportServices.fromCity, pattern),
      ilike(transportServices.toCity, pattern),
    );

    if (transportQuery) {
      transportConditions.push(transportQuery);
    }

    const placeQuery = or(
      ilike(placeServices.name, pattern),
      ilike(placeServices.code, pattern),
      ilike(placeServices.city, pattern),
      ilike(placeServices.nearestStation, pattern),
    );

    if (placeQuery) {
      placeConditions.push(placeQuery);
    }
  }

  const [transportRows, placeRows] = await Promise.all([
    wantsTransport
      ? db
          .select({
            id: transportServices.id,
            mode: transportServices.mode,
            code: transportServices.code,
            name: transportServices.name,
            price: transportServices.price,
            fromSpot: transportServices.fromSpot,
            toSpot: transportServices.toSpot,
            active: transportServices.active,
            updatedAt: transportServices.updatedAt,
          })
          .from(transportServices)
          .where(and(...transportConditions))
          .orderBy(asc(transportServices.name))
      : Promise.resolve([]),
    wantsPlace
      ? db
          .select({
            id: placeServices.id,
            kind: placeServices.kind,
            code: placeServices.code,
            name: placeServices.name,
            price: placeServices.price,
            city: placeServices.city,
            nearestStation: placeServices.nearestStation,
            stationAccessMin: placeServices.stationAccessMin,
            requiredVerifications: placeServices.requiredVerifications,
            ageLimit: placeServices.ageLimit,
            active: placeServices.active,
            updatedAt: placeServices.updatedAt,
          })
          .from(placeServices)
          .where(and(...placeConditions))
          .orderBy(asc(placeServices.name))
      : Promise.resolve([]),
  ]);

  const transportItems: ServiceListItem[] = transportRows.map((row) => ({
    id: row.id,
    category: row.mode as ServiceCategory,
    code: row.code,
    name: row.name,
    price: row.price,
    location: `${row.fromSpot} → ${row.toSpot}`,
    station: null,
    stationAccessMin: null,
    requiredVerifications: [],
    ageLimit: null,
    active: row.active,
    updatedAt: row.updatedAt,
  }));

  const placeItems: ServiceListItem[] = placeRows.map((row) => ({
    id: row.id,
    category: row.kind as ServiceCategory,
    code: row.code,
    name: row.name,
    price: row.price,
    location: row.city,
    station: row.nearestStation,
    stationAccessMin: row.stationAccessMin,
    requiredVerifications: row.requiredVerifications as VerificationKind[],
    ageLimit: row.ageLimit,
    active: row.active,
    updatedAt: row.updatedAt,
  }));

  return [...transportItems, ...placeItems].sort(compareByCategory);
}

export async function readTransportService(id: string) {
  const db = getDb();
  const [service] = await db
    .select()
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);

  return service ?? null;
}

export async function readPlaceService(id: string) {
  const db = getDb();
  const [service] = await db
    .select()
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);

  return service ?? null;
}

export async function readSupportedCities(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ city: transportServices.toCity })
    .from(transportServices)
    .where(eq(transportServices.active, true))
    .orderBy(asc(transportServices.toCity));

  return rows.map(({ city }) => city);
}
