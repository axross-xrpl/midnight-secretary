import "server-only";

import type { SQL } from "drizzle-orm";
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
import { getDb } from "@/db/client";
import type { PlaceService, TransportService } from "@/db/schema";
import { placeServices, transportServices } from "@/db/schema";
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type {
  PlaceKind,
  TransportMode,
  VerificationKind,
} from "@/features/services/constants";
import {
  isTransportCategory,
  placeKinds,
  serviceCategories,
  transportModes,
  verificationKinds,
} from "@/features/services/constants";
import type {
  PlaceServiceCreateInput,
  PlaceServiceDetailDto,
  PlaceServiceUpdateInput,
  ServiceListItemDto,
  TransportServiceCreateInput,
  TransportServiceDetailDto,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import type {
  CatalogSettingsPort,
  ServiceListFilters,
  ServiceReadError,
  ServiceWriteError,
} from "@/features/services/settings-port";
import { filterMap, isDefined } from "@/lib/array";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { postgresErrorCode } from "../pg-error";

type Db = ReturnType<typeof getDb>;

type DbRead<T> = (db: Db) => Promise<T>;

type DbWrite<T> = (db: Db) => Promise<Result<T, ServiceWriteError>>;

type ClassifyWriteError = (error: unknown) => ServiceWriteError | undefined;

type TransportListRow = Pick<
  TransportService,
  | "id"
  | "mode"
  | "code"
  | "name"
  | "price"
  | "fromSpot"
  | "toSpot"
  | "active"
  | "updatedAt"
>;

type PlaceListRow = Pick<
  PlaceService,
  | "id"
  | "kind"
  | "code"
  | "name"
  | "price"
  | "city"
  | "nearestStation"
  | "stationAccessMin"
  | "requiredVerifications"
  | "ageLimit"
  | "active"
  | "updatedAt"
>;

type GenreRow = Pick<PlaceService, "kind" | "genre">;

type OriginRow = { city: string; spot: string };

// mode / kind は DB の CHECK で絞られているが、型の上では text なのでここで絞る
// CHECK を外れた値は不変条件の違反なので throw し、呼び出し側で unavailable にする
const transportModeOf = (raw: string): TransportMode => {
  const mode = transportModes.find((value) => value === raw);

  if (mode === undefined) {
    throw new Error(`bug: transport_services.mode is ${raw}`);
  }

  return mode;
};

const placeKindOf = (raw: string): PlaceKind => {
  const kind = placeKinds.find((value) => value === raw);

  if (kind === undefined) {
    throw new Error(`bug: place_services.kind is ${raw}`);
  }

  return kind;
};

const isVerificationKind = (value: string): value is VerificationKind => {
  return verificationKinds.some((kind) => kind === value);
};

// required_verifications も CHECK で 3 値に絞られているが、型の上では text[] なので、秘書側の neon.ts と同じく知らない値を落とす
const verificationsOf = (raw: readonly string[]): VerificationKind[] => {
  return raw.filter(isVerificationKind);
};

const transportDetailOf = (
  row: TransportService,
): TransportServiceDetailDto => {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    mode: transportModeOf(row.mode),
    fromCity: row.fromCity,
    toCity: row.toCity,
    fromSpot: row.fromSpot,
    toSpot: row.toSpot,
    departTime: row.departTime,
    arriveTime: row.arriveTime,
    durationMin: row.durationMin,
    price: row.price,
    originAccessMin: row.originAccessMin,
    boardingBufferMin: row.boardingBufferMin,
    arrivalBufferMin: row.arrivalBufferMin,
    destinationAccessMin: row.destinationAccessMin,
    accessFare: row.accessFare,
    seatClass: row.seatClass,
    walletAddress: row.walletAddress,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
};

const placeDetailOf = (row: PlaceService): PlaceServiceDetailDto => {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: placeKindOf(row.kind),
    city: row.city,
    address: row.address,
    nearestStation: row.nearestStation,
    stationAccessMin: row.stationAccessMin,
    price: row.price,
    requiredVerifications: verificationsOf(row.requiredVerifications),
    itemName: row.itemName,
    genre: row.genre,
    openFrom: row.openFrom,
    openTo: row.openTo,
    checkinFrom: row.checkinFrom,
    checkoutBy: row.checkoutBy,
    rating: row.rating,
    breakfastIncluded: row.breakfastIncluded,
    hasAlcohol: row.hasAlcohol,
    seats: row.seats,
    ageLimit: row.ageLimit,
    walletAddress: row.walletAddress,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
};

const transportListItemOf = (row: TransportListRow): ServiceListItemDto => {
  return {
    id: row.id,
    category: transportModeOf(row.mode),
    code: row.code,
    name: row.name,
    price: row.price,
    location: `${row.fromSpot} → ${row.toSpot}`,
    station: null,
    stationAccessMin: null,
    requiredVerifications: [],
    ageLimit: null,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
};

const placeListItemOf = (row: PlaceListRow): ServiceListItemDto => {
  return {
    id: row.id,
    category: placeKindOf(row.kind),
    code: row.code,
    name: row.name,
    price: row.price,
    location: row.city,
    station: row.nearestStation,
    stationAccessMin: row.stationAccessMin,
    requiredVerifications: verificationsOf(row.requiredVerifications),
    ageLimit: row.ageLimit,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
};

/**
 * 種別の並び順
 *
 * 一覧は種別ごとに見出しを付けるので、その順をコードで決めた論理順 (鉄道 -> 航空 -> 宿泊 -> 飲食 -> レジャー) にする
 * 種別の中の並びには触れない
 * toSorted は安定なので、各テーブルから名前順で受け取った行の相対順序がそのまま残る
 */
const byCategory = (a: ServiceListItemDto, b: ServiceListItemDto): number => {
  return (
    serviceCategories.indexOf(a.category) -
    serviceCategories.indexOf(b.category)
  );
};

// 空文字の絞り込みは絞らないのと同じに扱う
const presentOf = (value: string | undefined): string | undefined => {
  if (value === undefined || value === "") {
    return undefined;
  }

  return value;
};

// `active` を省くと有効な行だけ、`"all"` なら有効フラグで絞らない
const activeOf = (filters: ServiceListFilters): boolean | undefined => {
  if (filters.active === "all") {
    return undefined;
  }

  return filters.active ?? true;
};

const patternOf = (filters: ServiceListFilters): string | undefined => {
  const query = presentOf(filters.query);

  if (query === undefined) {
    return undefined;
  }

  return `%${query}%`;
};

const transportConditionsOf = (filters: ServiceListFilters): SQL[] => {
  const active = activeOf(filters);
  const city = presentOf(filters.city);
  const pattern = patternOf(filters);

  return [
    active === undefined ? undefined : eq(transportServices.active, active),
    filters.category === undefined
      ? undefined
      : eq(transportServices.mode, filters.category),
    // 交通は出発・到着のどちらかが一致すればその都市の便として扱う
    city === undefined
      ? undefined
      : or(
          eq(transportServices.fromCity, city),
          eq(transportServices.toCity, city),
        ),
    pattern === undefined
      ? undefined
      : or(
          ilike(transportServices.name, pattern),
          ilike(transportServices.code, pattern),
          ilike(transportServices.fromSpot, pattern),
          ilike(transportServices.toSpot, pattern),
          ilike(transportServices.fromCity, pattern),
          ilike(transportServices.toCity, pattern),
        ),
  ].filter(isDefined);
};

const placeConditionsOf = (filters: ServiceListFilters): SQL[] => {
  const active = activeOf(filters);
  const city = presentOf(filters.city);
  const pattern = patternOf(filters);

  return [
    active === undefined ? undefined : eq(placeServices.active, active),
    filters.category === undefined
      ? undefined
      : eq(placeServices.kind, filters.category),
    city === undefined ? undefined : eq(placeServices.city, city),
    pattern === undefined
      ? undefined
      : or(
          ilike(placeServices.name, pattern),
          ilike(placeServices.code, pattern),
          ilike(placeServices.city, pattern),
          ilike(placeServices.nearestStation, pattern),
        ),
  ].filter(isDefined);
};

/**
 * サービス一覧を読む
 *
 * 一覧の行には最寄り駅と本人確認の要求も出すため、service_catalog ビューではなく実テーブルを引いて突き合わせる (ビューはこの 2 列を持たない)
 */
const readServiceList = async (
  db: Db,
  filters: ServiceListFilters,
): Promise<ServiceListItemDto[]> => {
  // 種別で絞ると、片方のテーブルは引く必要が無くなる
  const wantsTransport =
    filters.category === undefined || isTransportCategory(filters.category);
  const wantsPlace =
    filters.category === undefined || !isTransportCategory(filters.category);

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
          .where(and(...transportConditionsOf(filters)))
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
          .where(and(...placeConditionsOf(filters)))
          .orderBy(asc(placeServices.name))
      : Promise.resolve([]),
  ]);

  return [
    ...transportRows.map(transportListItemOf),
    ...placeRows.map(placeListItemOf),
  ].toSorted(byCategory);
};

const readTransportService = async (
  db: Db,
  id: string,
): Promise<TransportServiceDetailDto | undefined> => {
  const rows = await db
    .select()
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);
  const service = rows.at(0);

  if (service === undefined) {
    return undefined;
  }

  return transportDetailOf(service);
};

const readPlaceService = async (
  db: Db,
  id: string,
): Promise<PlaceServiceDetailDto | undefined> => {
  const rows = await db
    .select()
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);
  const service = rows.at(0);

  if (service === undefined) {
    return undefined;
  }

  return placeDetailOf(service);
};

const readSupportedCities = async (db: Db): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ city: transportServices.toCity })
    .from(transportServices)
    .where(eq(transportServices.active, true))
    .orderBy(asc(transportServices.toCity));

  return rows.map(({ city }) => city);
};

// 行は都市、起点の順に並んで届くので、都市ごとにまとめても都市の順と起点の順はそのまま残る
const homeOptionsOf = (rows: readonly OriginRow[]): HomeOption[] => {
  return [...Map.groupBy(rows, (row) => row.city)].map(([city, origins]) => ({
    city,
    spots: origins.map((origin) => origin.spot),
  }));
};

/**
 * 拠点として選べる都市と起点
 *
 * 自由入力にすると交通が 1 件も当たらない設定を作れてしまうので、登録済みの交通の有効行から導出する (`register-page-spec.md` §9 と同じ考え方)
 */
const readHomeOptions = async (db: Db): Promise<HomeOption[]> => {
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

// genre は IS NOT NULL で引いているが、型の上では null を含むので、境界で undefined に寄せて落とす
const genreOf = (row: GenreRow): string | undefined => {
  return row.genre ?? undefined;
};

const genresOf = (rows: readonly GenreRow[], kind: PlaceKind): string[] => {
  return filterMap(
    rows.filter((row) => row.kind === kind),
    genreOf,
  );
};

/**
 * 好み・趣味に選べるジャンル
 *
 * `place_services.genre` と突き合わせるので、選択肢も同じ列から出す
 */
const readGenreOptions = async (db: Db): Promise<GenreOptions> => {
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

  return {
    dining: genresOf(rows, "restaurant"),
    leisure: genresOf(rows, "leisure"),
  };
};

const classifyDatabaseError: ClassifyWriteError = (error) => {
  const code = postgresErrorCode(error);

  if (code === "23505") {
    return { kind: "duplicateCode" };
  }

  if (code === "23502" || code === "23514" || code === "22P02") {
    return { kind: "constraintViolation" };
  }

  return undefined;
};

// 無効化は移す前も制約違反を分類していなかったので、DB の失敗はすべて unavailable にする
const unclassified: ClassifyWriteError = () => {
  return undefined;
};

const transportValues = (input: TransportServiceCreateInput) => {
  return {
    code: input.code,
    name: input.name,
    mode: input.mode,
    fromCity: input.fromCity,
    toCity: input.toCity,
    fromSpot: input.fromSpot,
    toSpot: input.toSpot,
    departTime: input.departTime ?? null,
    arriveTime: input.arriveTime ?? null,
    durationMin: input.durationMin,
    price: input.price,
    originAccessMin: input.originAccessMin,
    boardingBufferMin: input.boardingBufferMin,
    arrivalBufferMin: input.arrivalBufferMin ?? null,
    destinationAccessMin: input.destinationAccessMin,
    accessFare: input.accessFare ?? null,
    seatClass: input.seatClass ?? null,
    walletAddress: input.walletAddress,
    active: input.active,
  };
};

const placeValues = (input: PlaceServiceCreateInput) => {
  return {
    code: input.code,
    kind: input.kind,
    name: input.name,
    city: input.city,
    address: input.address,
    nearestStation: input.nearestStation,
    stationAccessMin: input.stationAccessMin,
    price: input.price,
    requiredVerifications: input.requiredVerifications,
    itemName: input.itemName ?? null,
    genre: input.genre ?? null,
    openFrom: input.openFrom ?? null,
    openTo: input.openTo ?? null,
    checkinFrom: input.checkinFrom ?? null,
    checkoutBy: input.checkoutBy ?? null,
    rating: input.rating ?? null,
    breakfastIncluded: input.breakfastIncluded ?? null,
    hasAlcohol: input.hasAlcohol ?? null,
    seats: input.seats ?? null,
    ageLimit: input.ageLimit ?? null,
    walletAddress: input.walletAddress,
    active: input.active,
  };
};

// timestamptz はマイクロ秒まで持つが Date はミリ秒までなので、1 ミリ秒の幅で突き合わせる
const millisecondRange = (updatedAt: string) => {
  const start = new Date(updatedAt);

  return { start, end: new Date(start.getTime() + 1) };
};

const insertTransport = async (
  db: Db,
  input: TransportServiceCreateInput,
): Promise<Result<TransportServiceDetailDto, ServiceWriteError>> => {
  const now = new Date();
  const [service] = await db
    .insert(transportServices)
    .values({
      ...transportValues(input),
      updatedAt: now,
    })
    .returning();

  return ok(transportDetailOf(service));
};

const updateTransport = async (
  db: Db,
  id: string,
  input: TransportServiceUpdateInput,
): Promise<Result<TransportServiceDetailDto, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(input.updatedAt);
  const updated = await db
    .update(transportServices)
    .set({ ...transportValues(input), updatedAt: new Date() })
    .where(
      and(
        eq(transportServices.id, id),
        eq(transportServices.mode, input.mode),
        gte(transportServices.updatedAt, expectedUpdatedAt.start),
        lt(transportServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();
  const service = updated.at(0);

  if (service !== undefined) {
    return ok(transportDetailOf(service));
  }

  const rows = await db
    .select({ mode: transportServices.mode })
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);
  const current = rows.at(0);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (current.mode !== input.mode) {
    return err({ kind: "immutableCategory" });
  }

  return err({ kind: "conflict" });
};

const disableTransport = async (
  db: Db,
  id: string,
  updatedAt: string,
): Promise<Result<TransportServiceDetailDto, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const updated = await db
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
  const service = updated.at(0);

  if (service !== undefined) {
    return ok(transportDetailOf(service));
  }

  const rows = await db
    .select({ id: transportServices.id })
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);

  if (rows.at(0) === undefined) {
    return err({ kind: "notFound" });
  }

  return err({ kind: "conflict" });
};

const insertPlace = async (
  db: Db,
  input: PlaceServiceCreateInput,
): Promise<Result<PlaceServiceDetailDto, ServiceWriteError>> => {
  const now = new Date();
  const [service] = await db
    .insert(placeServices)
    .values({
      ...placeValues(input),
      updatedAt: now,
    })
    .returning();

  return ok(placeDetailOf(service));
};

const updatePlace = async (
  db: Db,
  id: string,
  input: PlaceServiceUpdateInput,
): Promise<Result<PlaceServiceDetailDto, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(input.updatedAt);
  const updated = await db
    .update(placeServices)
    .set({ ...placeValues(input), updatedAt: new Date() })
    .where(
      and(
        eq(placeServices.id, id),
        eq(placeServices.kind, input.kind),
        gte(placeServices.updatedAt, expectedUpdatedAt.start),
        lt(placeServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();
  const service = updated.at(0);

  if (service !== undefined) {
    return ok(placeDetailOf(service));
  }

  const rows = await db
    .select({ kind: placeServices.kind })
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);
  const current = rows.at(0);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (current.kind !== input.kind) {
    return err({ kind: "immutableCategory" });
  }

  return err({ kind: "conflict" });
};

const disablePlace = async (
  db: Db,
  id: string,
  updatedAt: string,
): Promise<Result<PlaceServiceDetailDto, ServiceWriteError>> => {
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const updated = await db
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
  const service = updated.at(0);

  if (service !== undefined) {
    return ok(placeDetailOf(service));
  }

  const rows = await db
    .select({ id: placeServices.id })
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);

  if (rows.at(0) === undefined) {
    return err({ kind: "notFound" });
  }

  return err({ kind: "conflict" });
};

// getDb() は DATABASE_URL が無いと同期的に投げるので、try の中で呼んで問い合わせの失敗と同じ unavailable にする
const reading = async <T>(
  read: DbRead<T>,
): Promise<Result<T, ServiceReadError>> => {
  try {
    return ok(await read(getDb()));
  } catch (cause) {
    return err({ kind: "unavailable", cause });
  }
};

// 想定の失敗 (制約違反) は種類ごとに、それ以外の DB の失敗は原因ごと unavailable にする
const writing = async <T>(
  write: DbWrite<T>,
  classify: ClassifyWriteError,
): Promise<Result<T, ServiceWriteError>> => {
  try {
    return await write(getDb());
  } catch (cause) {
    return err(classify(cause) ?? { kind: "unavailable", cause });
  }
};

/**
 * NeonDB の `transport_services` / `place_services` を設定画面の port として読み書きする
 *
 * 接続は各呼び出しの getDb() が持ち、`DATABASE_URL` が無いことも含めて DB の失敗は例外にせず値で返す
 */
export const createNeonCatalogSettings = (): CatalogSettingsPort => {
  return {
    listServices: (filters) => reading((db) => readServiceList(db, filters)),
    getTransportService: (id) => reading((db) => readTransportService(db, id)),
    getPlaceService: (id) => reading((db) => readPlaceService(db, id)),
    listSupportedCities: () => reading(readSupportedCities),
    listHomeOptions: () => reading(readHomeOptions),
    listGenreOptions: () => reading(readGenreOptions),
    createTransportService: (input) =>
      writing((db) => insertTransport(db, input), classifyDatabaseError),
    updateTransportService: (id, input) =>
      writing((db) => updateTransport(db, id, input), classifyDatabaseError),
    disableTransportService: (id, updatedAt) =>
      writing((db) => disableTransport(db, id, updatedAt), unclassified),
    createPlaceService: (input) =>
      writing((db) => insertPlace(db, input), classifyDatabaseError),
    updatePlaceService: (id, input) =>
      writing((db) => updatePlace(db, id, input), classifyDatabaseError),
    disablePlaceService: (id, updatedAt) =>
      writing((db) => disablePlace(db, id, updatedAt), unclassified),
  };
};
