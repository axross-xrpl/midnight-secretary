import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { placeServices } from "@/db/schema";
import type { ServiceCandidate, ServiceKind } from "@/lib/types";

/** 1 種別あたり AI に渡す候補の上限 */
const MAX_CANDIDATES_PER_KIND = 20;

/**
 * 利用者が書く都市名の揺れを DB の値に寄せる
 *
 * `place_services.city` は「大阪」なので、「大阪市」などで来ても同じ行に当てる
 */
const CITY_ALIASES: Readonly<Record<string, string>> = {
  大阪: "大阪",
  大阪市: "大阪",
  大阪府: "大阪",
  大阪府大阪市: "大阪",
  東京: "東京",
  東京都: "東京",
};

export function normalizeCity(city: string | undefined): string | undefined {
  if (city === undefined) {
    return undefined;
  }

  const trimmed = city.trim();

  return CITY_ALIASES[trimmed] ?? trimmed;
}

const optional = <T>(value: T | null): T | undefined => {
  return value === null ? undefined : value;
};

// time 型は "HH:MM:SS" で来るので、表示と AI に渡す形に合わせて時分へ切る
const hourMinute = (value: string | null): string | undefined => {
  return value === null ? undefined : value.slice(0, 5);
};

type PlaceRow = typeof placeServices.$inferSelect;

/**
 * DB の行を AI に渡す候補にする
 *
 * 種別で使わない列は NULL なので、そのまま落として渡す項目を減らす
 */
function toCandidate(row: PlaceRow): ServiceCandidate {
  const optionals = {
    itemName: optional(row.itemName),
    genre: optional(row.genre),
    rating: optional(row.rating),
    openFrom: hourMinute(row.openFrom),
    openTo: hourMinute(row.openTo),
    checkinFrom: hourMinute(row.checkinFrom),
    checkoutBy: hourMinute(row.checkoutBy),
    breakfastIncluded: optional(row.breakfastIncluded),
    hasAlcohol: optional(row.hasAlcohol),
    seats: optional(row.seats),
    ageLimit: optional(row.ageLimit),
  };

  return {
    id: row.code,
    kind: row.kind as ServiceKind,
    name: row.name,
    city: row.city,
    address: row.address,
    nearestStation: row.nearestStation,
    stationAccessMin: row.stationAccessMin,
    priceJpy: row.price,
    requiredVerifications: row.requiredVerifications,
    // undefined の項目は落として、AI に渡す JSON を短くする
    ...Object.fromEntries(
      Object.entries(optionals).filter(([, value]) => value !== undefined),
    ),
  };
}

export type CandidateFilters = {
  city?: string;
  /** 宿泊の 1 泊あたりの上限。飲食・レジャーには効かせない */
  maxPrice?: number;
};

/**
 * 種別ごとに候補を読む
 *
 * 無効な行 (`active = false`) は候補に出さない
 * 上限価格は「1 泊の上限」なので宿泊にだけ効かせる
 */
export async function findCandidates(
  kind: ServiceKind,
  filters: CandidateFilters = {},
): Promise<ServiceCandidate[]> {
  const city = normalizeCity(filters.city);
  const conditions = [
    eq(placeServices.active, true),
    eq(placeServices.kind, kind),
  ];

  if (city !== undefined) {
    conditions.push(eq(placeServices.city, city));
  }

  if (kind === "hotel" && filters.maxPrice !== undefined) {
    conditions.push(lte(placeServices.price, filters.maxPrice));
  }

  const rows = await getDb()
    .select()
    .from(placeServices)
    .where(and(...conditions))
    .orderBy(asc(placeServices.price), asc(placeServices.code))
    .limit(MAX_CANDIDATES_PER_KIND);

  return rows.map(toCandidate);
}

/**
 * ホテルの質問 1 回で、宿泊・飲食・レジャーをまとめて読む
 */
export async function findCandidatesByKind(
  filters: CandidateFilters = {},
): Promise<Record<ServiceKind, ServiceCandidate[]>> {
  const [hotel, restaurant, leisure] = await Promise.all([
    findCandidates("hotel", filters),
    findCandidates("restaurant", filters),
    findCandidates("leisure", filters),
  ]);

  return { hotel, restaurant, leisure };
}

/**
 * 会話の回答対象を id で絞る
 *
 * 種別をまたいで引くので、宿泊の話から飲食へ移っても同じ経路で答えられる
 */
export async function selectCandidatesById(
  filters: CandidateFilters,
  candidateIds: string[],
): Promise<ServiceCandidate[]> {
  if (candidateIds.length === 0) {
    return [];
  }

  const city = normalizeCity(filters.city);
  const conditions = [
    eq(placeServices.active, true),
    inArray(placeServices.code, candidateIds),
  ];

  if (city !== undefined) {
    conditions.push(eq(placeServices.city, city));
  }

  const rows = await getDb()
    .select()
    .from(placeServices)
    .where(and(...conditions))
    .orderBy(asc(placeServices.kind), asc(placeServices.code));

  return rows.map(toCandidate);
}

/**
 * 予約・決済のためにホテル 1 件を id で解決する
 *
 * 料金はクライアントから受け取らず、必ずここで DB から引く
 */
export async function findHotelById(
  code: string,
): Promise<ServiceCandidate | undefined> {
  const [row] = await getDb()
    .select()
    .from(placeServices)
    .where(
      and(
        eq(placeServices.active, true),
        eq(placeServices.kind, "hotel"),
        eq(placeServices.code, code),
      ),
    )
    .limit(1);

  return row === undefined ? undefined : toCandidate(row);
}
