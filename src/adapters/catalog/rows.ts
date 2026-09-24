import type {
  DoorToDoor,
  LodgingOffer,
  OfferQuery,
  PlaceOffer,
  PlaceOfferKind,
  PlaceServiceRow,
  ServiceListFilters,
  ServiceListItem,
  TransportMode,
  TransportOffer,
  TransportServiceRow,
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
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type { ServiceCategory } from "@/features/services/constants";
import {
  isTransportCategory,
  serviceCategories,
} from "@/features/services/constants";
import type {
  PlaceServiceCreateInput,
  TransportServiceCreateInput,
} from "@/features/services/schemas";
import { jstDateTimeOf } from "../jst";

/**
 * 交通 1 行のうち候補を作るのに要る列
 *
 * Neon は必要な列だけを select し、Fake は行全体を渡す
 */
export type TransportOfferRow = Pick<
  TransportServiceRow,
  | "code"
  | "name"
  | "mode"
  | "fromSpot"
  | "toSpot"
  | "departTime"
  | "arriveTime"
  | "durationMin"
  | "price"
  | "originAccessMin"
  | "boardingBufferMin"
  | "arrivalBufferMin"
  | "destinationAccessMin"
  | "accessFare"
  | "walletAddress"
>;

/**
 * 場所系 1 行のうち候補を作るのに要る列
 */
export type PlaceOfferRow = Pick<
  PlaceServiceRow,
  | "code"
  | "kind"
  | "name"
  | "city"
  | "genre"
  | "price"
  | "requiredVerifications"
  | "rating"
  | "ageLimit"
  | "walletAddress"
>;

/**
 * 金額の通貨
 *
 * DB は円単位の整数を持つが、`Money` の通貨はデモ用の 2 つしか無い
 * 金額の大きさは同じなので、fake と real で揃えて MST 建てとして扱う
 */
export const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const VERIFICATION_KINDS: readonly string[] = [
  "age",
  "nationality",
  "residence",
];

/**
 * DB の CHECK で 3 値に絞られているが、型の上では text[] なのでここで絞る
 */
export const verificationsOf = (raw: readonly string[]): VerificationKind[] => {
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

/**
 * 拠点から目的地までの所要と総額
 *
 * 内訳は交通の行が自己完結して持つので、移動条件のテーブルを引かない
 */
const doorToDoorOf = (row: TransportOfferRow): DoorToDoor => {
  return {
    totalMin:
      row.originAccessMin +
      row.boardingBufferMin +
      row.durationMin +
      (row.arrivalBufferMin ?? 0) +
      row.destinationAccessMin,
    totalPrice: mst(row.price + (row.accessFare ?? 0)),
  };
};

/**
 * 交通 1 行を候補にする
 *
 * 時刻を持たない行は旅程に置けないので候補から外す
 * `vendor` は DB に列が無い (事業者マスタを持たない設計) ので名称をそのまま使う
 */
export const transportOfferOn = (
  row: TransportOfferRow,
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
    price: mst(row.price),
    doorToDoor: doorToDoorOf(row),
  };
};

/**
 * 宿泊 1 行を、滞在全体の料金の候補にする
 */
export const lodgingOfferFor = (
  row: PlaceOfferRow,
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
    price: mst(row.price * nights),
    ...(row.rating === null ? {} : { rating: row.rating }),
    requiredVerifications: verificationsOf(row.requiredVerifications),
  };
};

/**
 * 飲食・レジャー 1 行を候補にする
 */
export const placeOfferOf = (
  row: PlaceOfferRow,
  kind: PlaceOfferKind,
): PlaceOffer => {
  const genre = optional(row.genre);
  const ageLimit = optional(row.ageLimit);

  return {
    id: offerId(row.code),
    kind,
    payee: payeeOf(row.walletAddress),
    name: row.name,
    city: row.city,
    ...(genre === undefined ? {} : { genre }),
    price: mst(row.price),
    requiredVerifications: verificationsOf(row.requiredVerifications),
    ...(ageLimit === undefined ? {} : { ageLimit }),
  };
};

/**
 * 交通 1 行を一覧の形にする
 */
export const transportListItemOf = (
  row: TransportServiceRow,
): ServiceListItem => {
  return {
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
  };
};

/**
 * 場所系 1 行を一覧の形にする
 */
export const placeListItemOf = (row: PlaceServiceRow): ServiceListItem => {
  return {
    id: row.id,
    category: row.kind as ServiceCategory,
    code: row.code,
    name: row.name,
    price: row.price,
    location: row.city,
    station: row.nearestStation,
    stationAccessMin: row.stationAccessMin,
    requiredVerifications: verificationsOf(row.requiredVerifications),
    ageLimit: row.ageLimit,
    active: row.active,
    updatedAt: row.updatedAt,
  };
};

const categoryIndex = (category: ServiceCategory): number => {
  return serviceCategories.indexOf(category);
};

/**
 * 種別の論理順 (鉄道・航空・宿泊・飲食・レジャー) に並べる
 *
 * 種別の中の並びには触れない。安定ソートなので、名前順で受け取った行の相対順序がそのまま残る
 */
export const sortedByCategory = (
  items: readonly ServiceListItem[],
): ServiceListItem[] => {
  return items.toSorted(
    (a, b) => categoryIndex(a.category) - categoryIndex(b.category),
  );
};

const byName = <T extends { name: string }>(a: T, b: T): number => {
  return a.name.localeCompare(b.name);
};

/**
 * 交通と場所系の行を、それぞれ名前順にしてから種別順に並べた一覧
 */
export const serviceListOf = (
  transport: readonly TransportServiceRow[],
  places: readonly PlaceServiceRow[],
): ServiceListItem[] => {
  return sortedByCategory([
    ...transport.toSorted(byName).map(transportListItemOf),
    ...places.toSorted(byName).map(placeListItemOf),
  ]);
};

// 一覧の絞り込みのうち、交通と場所系に共通する有効フラグ
const matchesActive = (
  active: boolean,
  filter: ServiceListFilters["active"],
): boolean => {
  if (filter === "all") {
    return true;
  }

  return active === (filter ?? true);
};

const containsIgnoringCase = (haystack: string, needle: string): boolean => {
  return haystack.toLowerCase().includes(needle.toLowerCase());
};

/**
 * 交通 1 行が一覧の絞り込みに合うか (Neon の WHERE と同じ条件)
 *
 * 都市は出発・到着のどちらかが一致すればその都市の便として扱う
 */
export const matchesTransportFilters = (
  row: TransportServiceRow,
  filters: ServiceListFilters,
): boolean => {
  if (!matchesActive(row.active, filters.active)) {
    return false;
  }

  if (
    filters.category !== undefined &&
    !isTransportCategory(filters.category)
  ) {
    return false;
  }

  if (filters.category !== undefined && row.mode !== filters.category) {
    return false;
  }

  if (
    filters.city !== undefined &&
    row.fromCity !== filters.city &&
    row.toCity !== filters.city
  ) {
    return false;
  }

  if (filters.query === undefined) {
    return true;
  }

  const query = filters.query;

  return [
    row.name,
    row.code,
    row.fromSpot,
    row.toSpot,
    row.fromCity,
    row.toCity,
  ].some((value) => containsIgnoringCase(value, query));
};

/**
 * 場所系 1 行が一覧の絞り込みに合うか (Neon の WHERE と同じ条件)
 */
export const matchesPlaceFilters = (
  row: PlaceServiceRow,
  filters: ServiceListFilters,
): boolean => {
  if (!matchesActive(row.active, filters.active)) {
    return false;
  }

  if (filters.category !== undefined && isTransportCategory(filters.category)) {
    return false;
  }

  if (filters.category !== undefined && row.kind !== filters.category) {
    return false;
  }

  if (filters.city !== undefined && row.city !== filters.city) {
    return false;
  }

  if (filters.query === undefined) {
    return true;
  }

  const query = filters.query;

  return [row.name, row.code, row.city, row.nearestStation].some((value) =>
    containsIgnoringCase(value, query),
  );
};

/**
 * 出発地の (都市, 起点) の組から拠点の選択肢を作る
 *
 * 都市順、都市の中は起点順で、重複は 1 つにまとめる
 */
export const homeOptionsOf = (
  origins: readonly { city: string; spot: string }[],
): HomeOption[] => {
  const cities = [...new Set(origins.map((origin) => origin.city))].toSorted();

  return cities.map((city) => ({
    city,
    spots: [
      ...new Set(
        origins
          .filter((origin) => origin.city === city)
          .map((origin) => origin.spot),
      ),
    ].toSorted(),
  }));
};

const distinctGenres = (
  rows: readonly { kind: string; genre: string | null }[],
  kind: string,
): string[] => {
  return [
    ...new Set(
      rows
        .filter((row) => row.kind === kind)
        .map((row) => row.genre)
        .filter((genre) => genre !== null),
    ),
  ].toSorted();
};

/**
 * 飲食・レジャーの (種別, genre) からジャンルの選択肢を作る
 *
 * `place_services.genre` と突き合わせるので、選択肢も同じ列から出す
 */
export const genreOptionsOf = (
  rows: readonly { kind: string; genre: string | null }[],
): GenreOptions => {
  return {
    dining: distinctGenres(rows, "restaurant"),
    leisure: distinctGenres(rows, "leisure"),
  };
};

/**
 * 交通の入力のうち行に写す列
 */
export const transportValuesOf = (input: TransportServiceCreateInput) => {
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

/**
 * 場所系の入力のうち行に写す列
 */
export const placeValuesOf = (input: PlaceServiceCreateInput) => {
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

/**
 * 取得時の `updatedAt` が行と同じ時刻を指すか
 *
 * timestamptz はマイクロ秒まで持つが Date はミリ秒までなので、ミリ秒で突き合わせる (Neon の 1 ミリ秒幅と同じ)
 */
export const matchesUpdatedAt = (
  row: { updatedAt: Date },
  updatedAt: string,
): boolean => {
  return row.updatedAt.getTime() === Date.parse(updatedAt);
};
