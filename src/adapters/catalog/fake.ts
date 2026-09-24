import type {
  CatalogError,
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
import type { IsoDate, IsoDateTime } from "@/domain/identifiers";
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type { PlaceKind } from "@/features/services/constants";
import {
  isTransportCategory,
  serviceCategories,
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
  ServiceWriteError,
} from "@/features/services/settings-port";
import { filterMap } from "@/lib/array";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { lodgingOfferFor, placeOfferOf, transportOfferOn } from "./offers";

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
  price: number;
  originAccessMin: number;
  boardingBufferMin: number;
  arrivalBufferMin: number;
  destinationAccessMin: number;
  accessFare: number;
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
  pricePerNight: number;
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
  price: number;
  requiredVerifications: readonly VerificationKind[];
  ageLimit?: number;
};

/**
 * Fake のカタログが返す運賃
 *
 * fake と real の結果が揃うよう、NeonDB の有効な行をそのまま写している
 */
export type FakeCatalogSeed = {
  transport: readonly TransportTemplate[];
  lodging: readonly LodgingTemplate[];
  places: readonly PlaceTemplate[];
};

/**
 * fake が採番するものと時計
 *
 * テストでは閉じたカウンタと止まった時計、runtime では randomUUID と実時刻を渡す
 * 行の id は Route Handler が uuid として検査するので、uuid の形で返す
 */
export type FakeCatalogIds = {
  newServiceId: () => string;
  now: () => IsoDateTime;
};

/**
 * fake が持つサービスの行
 *
 * 設定画面の DTO の形で持ち、秘書の候補も同じ行から作る
 */
type FakeCatalogState = {
  transport: readonly TransportServiceDetailDto[];
  places: readonly PlaceServiceDetailDto[];
};

// 受取先は売り手側の 2 つ。DB の行と同じダミー値を使う
const TRANSPORT_PAYEE = "mn_shield-addr_test1demo-transport-seller";

const SERVICE_PAYEE = "mn_shield-addr_test1demo-service-seller";

// seed は最寄り駅までの時間を持たないので、設定画面で読める既定の値を置く
const SEED_STATION_ACCESS_MIN = 5;

const transportRowOf = (
  template: TransportTemplate,
  ids: FakeCatalogIds,
): TransportServiceDetailDto => {
  return {
    id: ids.newServiceId(),
    code: template.code,
    name: template.name,
    mode: template.mode,
    fromCity: template.fromCity,
    toCity: template.toCity,
    fromSpot: template.fromSpot,
    toSpot: template.toSpot,
    departTime: template.departTime,
    arriveTime: template.arriveTime,
    durationMin: template.durationMin,
    price: template.price,
    originAccessMin: template.originAccessMin,
    boardingBufferMin: template.boardingBufferMin,
    arrivalBufferMin: template.arrivalBufferMin,
    destinationAccessMin: template.destinationAccessMin,
    accessFare: template.accessFare,
    seatClass: null,
    walletAddress: TRANSPORT_PAYEE,
    active: true,
    updatedAt: ids.now(),
  };
};

// seed は住所と最寄り駅を持たないので、どちらも都市で埋める
const lodgingRowOf = (
  template: LodgingTemplate,
  ids: FakeCatalogIds,
): PlaceServiceDetailDto => {
  return {
    id: ids.newServiceId(),
    code: template.code,
    name: template.name,
    kind: "hotel",
    city: template.city,
    address: template.city,
    nearestStation: template.city,
    stationAccessMin: SEED_STATION_ACCESS_MIN,
    price: template.pricePerNight,
    requiredVerifications: [...template.requiredVerifications],
    itemName: null,
    genre: null,
    openFrom: null,
    openTo: null,
    checkinFrom: null,
    checkoutBy: null,
    rating: template.rating,
    breakfastIncluded: null,
    hasAlcohol: null,
    seats: null,
    ageLimit: null,
    walletAddress: SERVICE_PAYEE,
    active: true,
    updatedAt: ids.now(),
  };
};

const placeRowOf = (
  template: PlaceTemplate,
  ids: FakeCatalogIds,
): PlaceServiceDetailDto => {
  return {
    id: ids.newServiceId(),
    code: template.code,
    name: template.name,
    kind: template.kind,
    city: template.city,
    address: template.city,
    nearestStation: template.city,
    stationAccessMin: SEED_STATION_ACCESS_MIN,
    price: template.price,
    requiredVerifications: [...template.requiredVerifications],
    itemName: null,
    genre: template.genre,
    openFrom: null,
    openTo: null,
    checkinFrom: null,
    checkoutBy: null,
    rating: null,
    breakfastIncluded: null,
    hasAlcohol: null,
    seats: null,
    ageLimit: template.ageLimit ?? null,
    walletAddress: SERVICE_PAYEE,
    active: true,
    updatedAt: ids.now(),
  };
};

// 宿泊も飲食・レジャーも place_services の行なので、場所系の行として 1 つに並べる
const initialStateOf = (
  seed: FakeCatalogSeed,
  ids: FakeCatalogIds,
): FakeCatalogState => {
  return {
    transport: seed.transport.map((template) => transportRowOf(template, ids)),
    places: [
      ...seed.lodging.map((template) => lodgingRowOf(template, ids)),
      ...seed.places.map((template) => placeRowOf(template, ids)),
    ],
  };
};

// real は ORDER BY で並べるので、fake も文字コード順に並べる
const compareText = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
};

const byCode = (a: { code: string }, b: { code: string }): number => {
  return compareText(a.code, b.code);
};

const byName = (a: { name: string }, b: { name: string }): number => {
  return compareText(a.name, b.name);
};

const distinctSorted = (values: readonly string[]): string[] => {
  return [...new Set(values)].toSorted(compareText);
};

const isActive = (row: { active: boolean }): boolean => {
  return row.active;
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

// 目的地は有効な交通の到着都市 (real の listDestinations と同じ導き方)
const destinationsOf = (state: FakeCatalogState): string[] => {
  return distinctSorted(
    state.transport.filter(isActive).map((row) => row.toCity),
  );
};

const transportBetween = (
  state: FakeCatalogState,
  origin: string,
  destination: string,
  date: IsoDate,
): readonly TransportOffer[] => {
  return filterMap(
    state.transport
      .filter(isActive)
      .filter(
        (row) =>
          matchesPlaceName(row.fromCity, row.fromSpot, origin) &&
          matchesPlaceName(row.toCity, row.toSpot, destination),
      )
      .toSorted(byCode),
    (row) => transportOfferOn(row, date),
  );
};

const placesIn = (
  state: FakeCatalogState,
  kind: PlaceKind,
  city: string,
): readonly PlaceServiceDetailDto[] => {
  return state.places
    .filter(isActive)
    .filter((row) => row.kind === kind && row.city === city)
    .toSorted(byCode);
};

const lodgingFor = (
  state: FakeCatalogState,
  query: OfferQuery,
  nights: number,
): readonly LodgingOffer[] => {
  if (nights <= 0) {
    return [];
  }

  return placesIn(state, "hotel", query.destination).map((row) =>
    lodgingOfferFor(row, query, nights),
  );
};

const placesFor = (
  state: FakeCatalogState,
  kind: PlaceOfferKind,
  city: string,
): readonly PlaceOffer[] => {
  return placesIn(state, kind, city).map((row) => placeOfferOf(row, kind));
};

const findOffers = (
  state: FakeCatalogState,
  query: OfferQuery,
): Result<OfferSet, CatalogError> => {
  if (!destinationsOf(state).includes(query.destination)) {
    return err({ kind: "unknownDestination", destination: query.destination });
  }

  const nights = nightsBetween(query.departOn, query.returnOn);

  return ok({
    outbound: transportBetween(
      state,
      query.origin,
      query.destination,
      query.departOn,
    ),
    inbound: transportBetween(
      state,
      query.destination,
      query.origin,
      query.returnOn,
    ),
    lodging: lodgingFor(state, query, nights),
    dining: placesFor(state, "restaurant", query.destination),
    leisure: placesFor(state, "leisure", query.destination),
  });
};

// 空文字の絞り込みは絞らないのと同じに扱う (real と同じ)
const presentOf = (value: string | undefined): string | undefined => {
  if (value === undefined || value === "") {
    return undefined;
  }

  return value;
};

// `active` を省くと有効な行だけ、`"all"` なら有効フラグで絞らない
const matchesActive = (
  active: boolean,
  filters: ServiceListFilters,
): boolean => {
  if (filters.active === "all") {
    return true;
  }

  return active === (filters.active ?? true);
};

// real の ILIKE '%query%' と同じく、大文字小文字を区別しない部分一致
const containsQuery = (
  values: readonly string[],
  query: string | undefined,
): boolean => {
  if (query === undefined) {
    return true;
  }

  const needle = query.toLowerCase();

  return values.some((value) => value.toLowerCase().includes(needle));
};

// 交通は出発・到着のどちらかが一致すればその都市の便として扱う
const matchesTransportFilters = (
  row: TransportServiceDetailDto,
  filters: ServiceListFilters,
): boolean => {
  const city = presentOf(filters.city);

  if (!matchesActive(row.active, filters)) {
    return false;
  }

  if (filters.category !== undefined && row.mode !== filters.category) {
    return false;
  }

  if (city !== undefined && row.fromCity !== city && row.toCity !== city) {
    return false;
  }

  return containsQuery(
    [row.name, row.code, row.fromSpot, row.toSpot, row.fromCity, row.toCity],
    presentOf(filters.query),
  );
};

const matchesPlaceFilters = (
  row: PlaceServiceDetailDto,
  filters: ServiceListFilters,
): boolean => {
  const city = presentOf(filters.city);

  if (!matchesActive(row.active, filters)) {
    return false;
  }

  if (filters.category !== undefined && row.kind !== filters.category) {
    return false;
  }

  if (city !== undefined && row.city !== city) {
    return false;
  }

  return containsQuery(
    [row.name, row.code, row.city, row.nearestStation],
    presentOf(filters.query),
  );
};

const transportListItemOf = (
  row: TransportServiceDetailDto,
): ServiceListItemDto => {
  return {
    id: row.id,
    category: row.mode,
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

const placeListItemOf = (row: PlaceServiceDetailDto): ServiceListItemDto => {
  return {
    id: row.id,
    category: row.kind,
    code: row.code,
    name: row.name,
    price: row.price,
    location: row.city,
    station: row.nearestStation,
    stationAccessMin: row.stationAccessMin,
    requiredVerifications: row.requiredVerifications,
    ageLimit: row.ageLimit,
    active: row.active,
    updatedAt: row.updatedAt,
  };
};

// 種別の論理順 (鉄道 -> 航空 -> 宿泊 -> 飲食 -> レジャー) に並べる
// toSorted は安定なので、名前順に並べた種別の中の順序はそのまま残る
const byCategory = (a: ServiceListItemDto, b: ServiceListItemDto): number => {
  return (
    serviceCategories.indexOf(a.category) -
    serviceCategories.indexOf(b.category)
  );
};

const serviceListOf = (
  state: FakeCatalogState,
  filters: ServiceListFilters,
): ServiceListItemDto[] => {
  // 種別で絞ると、片方の行は見る必要が無くなる (real と同じ)
  const wantsTransport =
    filters.category === undefined || isTransportCategory(filters.category);
  const wantsPlace =
    filters.category === undefined || !isTransportCategory(filters.category);
  const transport = wantsTransport
    ? state.transport.filter((row) => matchesTransportFilters(row, filters))
    : [];
  const places = wantsPlace
    ? state.places.filter((row) => matchesPlaceFilters(row, filters))
    : [];

  return [
    ...transport.toSorted(byName).map(transportListItemOf),
    ...places.toSorted(byName).map(placeListItemOf),
  ].toSorted(byCategory);
};

// 拠点は有効な交通の出発地から、都市順、都市の中は起点順で作る (real と同じ)
const homeOptionsOf = (state: FakeCatalogState): HomeOption[] => {
  const origins = state.transport.filter(isActive);

  return distinctSorted(origins.map((row) => row.fromCity)).map((city) => ({
    city,
    spots: distinctSorted(
      origins.filter((row) => row.fromCity === city).map((row) => row.fromSpot),
    ),
  }));
};

// genre の空は DTO では null なので、境界で undefined に寄せて落とす
const genreOf = (row: PlaceServiceDetailDto): string | undefined => {
  return row.genre ?? undefined;
};

const genresOf = (state: FakeCatalogState, kind: PlaceKind): string[] => {
  return distinctSorted(
    filterMap(
      state.places.filter(isActive).filter((row) => row.kind === kind),
      genreOf,
    ),
  );
};

const genreOptionsOf = (state: FakeCatalogState): GenreOptions => {
  return {
    dining: genresOf(state, "restaurant"),
    leisure: genresOf(state, "leisure"),
  };
};

// code は各テーブルの中で一意 (交通と場所系の間では重なってよい)
const codeTaken = (
  rows: readonly { id: string; code: string }[],
  code: string,
  ownId: string | undefined,
): boolean => {
  return rows.some((row) => row.code === code && row.id !== ownId);
};

// real は timestamptz を 1 ミリ秒の幅で突き合わせるので、fake はミリ秒の一致で比べる
const sameInstant = (a: string, b: string): boolean => {
  return Date.parse(a) === Date.parse(b);
};

const transportValuesOf = (input: TransportServiceCreateInput) => {
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

const placeValuesOf = (input: PlaceServiceCreateInput) => {
  return {
    code: input.code,
    name: input.name,
    kind: input.kind,
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

// 行はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const putTransport = (
  state: FakeCatalogState,
  transport: readonly TransportServiceDetailDto[],
): void => {
  state.transport = transport;
};

// 行はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const putPlaces = (
  state: FakeCatalogState,
  places: readonly PlaceServiceDetailDto[],
): void => {
  state.places = places;
};

const createTransport = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  input: TransportServiceCreateInput,
): Result<TransportServiceDetailDto, ServiceWriteError> => {
  if (codeTaken(state.transport, input.code, undefined)) {
    return err({ kind: "duplicateCode" });
  }

  const created: TransportServiceDetailDto = {
    id: ids.newServiceId(),
    ...transportValuesOf(input),
    updatedAt: ids.now(),
  };

  putTransport(state, [...state.transport, created]);

  return ok(created);
};

// 判定の順は real と同じ: 行が無い -> 種別が違う -> 取得時の updatedAt が古い -> code の重複 (UPDATE が当たったときだけ一意制約が効く)
const updateTransport = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  input: TransportServiceUpdateInput,
): Result<TransportServiceDetailDto, ServiceWriteError> => {
  const current = state.transport.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (current.mode !== input.mode) {
    return err({ kind: "immutableCategory" });
  }

  if (!sameInstant(current.updatedAt, input.updatedAt)) {
    return err({ kind: "conflict" });
  }

  if (codeTaken(state.transport, input.code, id)) {
    return err({ kind: "duplicateCode" });
  }

  const updated: TransportServiceDetailDto = {
    id,
    ...transportValuesOf(input),
    updatedAt: ids.now(),
  };

  putTransport(
    state,
    state.transport.with(state.transport.indexOf(current), updated),
  );

  return ok(updated);
};

const disableTransport = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  updatedAt: string,
): Result<TransportServiceDetailDto, ServiceWriteError> => {
  const current = state.transport.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (!sameInstant(current.updatedAt, updatedAt)) {
    return err({ kind: "conflict" });
  }

  const disabled: TransportServiceDetailDto = {
    ...current,
    active: false,
    updatedAt: ids.now(),
  };

  putTransport(
    state,
    state.transport.with(state.transport.indexOf(current), disabled),
  );

  return ok(disabled);
};

const createPlace = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  input: PlaceServiceCreateInput,
): Result<PlaceServiceDetailDto, ServiceWriteError> => {
  if (codeTaken(state.places, input.code, undefined)) {
    return err({ kind: "duplicateCode" });
  }

  const created: PlaceServiceDetailDto = {
    id: ids.newServiceId(),
    ...placeValuesOf(input),
    updatedAt: ids.now(),
  };

  putPlaces(state, [...state.places, created]);

  return ok(created);
};

// 判定の順は交通の更新と同じ
const updatePlace = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  input: PlaceServiceUpdateInput,
): Result<PlaceServiceDetailDto, ServiceWriteError> => {
  const current = state.places.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (current.kind !== input.kind) {
    return err({ kind: "immutableCategory" });
  }

  if (!sameInstant(current.updatedAt, input.updatedAt)) {
    return err({ kind: "conflict" });
  }

  if (codeTaken(state.places, input.code, id)) {
    return err({ kind: "duplicateCode" });
  }

  const updated: PlaceServiceDetailDto = {
    id,
    ...placeValuesOf(input),
    updatedAt: ids.now(),
  };

  putPlaces(state, state.places.with(state.places.indexOf(current), updated));

  return ok(updated);
};

const disablePlace = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  updatedAt: string,
): Result<PlaceServiceDetailDto, ServiceWriteError> => {
  const current = state.places.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (!sameInstant(current.updatedAt, updatedAt)) {
    return err({ kind: "conflict" });
  }

  const disabled: PlaceServiceDetailDto = {
    ...current,
    active: false,
    updatedAt: ids.now(),
  };

  putPlaces(state, state.places.with(state.places.indexOf(current), disabled));

  return ok(disabled);
};

/**
 * NeonDB の有効な行を写した seed
 *
 * DB を用意せずに動かすためのもので、カタログの port が fake のときに常に使う
 * 行を足すときは DB 側の seed と同じ値にする。ずれると fake と real で提案が変わる
 */
export const seedCatalog = (): FakeCatalogSeed => {
  return {
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
        price: 13000,
        originAccessMin: 50,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 30,
        accessFare: 1350,
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
        price: 13000,
        originAccessMin: 30,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 50,
        accessFare: 1350,
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
        price: 12600,
        originAccessMin: 50,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 30,
        accessFare: 1350,
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
        price: 7800,
        originAccessMin: 95,
        boardingBufferMin: 60,
        arrivalBufferMin: 20,
        destinationAccessMin: 55,
        accessFare: 4460,
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
        price: 14400,
        originAccessMin: 25,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFare: 660,
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
        price: 14720,
        originAccessMin: 25,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFare: 660,
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
        price: 14520,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFare: 490,
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
        price: 19590,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFare: 490,
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
        price: 14520,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 15,
        accessFare: 490,
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
        price: 14720,
        originAccessMin: 15,
        boardingBufferMin: 10,
        arrivalBufferMin: 0,
        destinationAccessMin: 25,
        accessFare: 660,
      },
    ],

    lodging: [
      {
        code: "hotel-namba-c",
        name: "なんばホテルC",
        city: "大阪",
        pricePerNight: 12500,
        rating: 4,
        requiredVerifications: [],
      },
      {
        code: "hotel-osaka-a",
        name: "ホテルA 大阪梅田",
        city: "大阪",
        pricePerNight: 8000,
        rating: 3.5,
        requiredVerifications: [],
      },
      {
        code: "hotel-osaka-b",
        name: "ホテルB 大阪梅田",
        city: "大阪",
        pricePerNight: 16000,
        rating: 4.3,
        requiredVerifications: [],
      },
      {
        code: "hotel-osakabay-inbound",
        name: "ホテル大阪ベイF",
        city: "大阪",
        pricePerNight: 9800,
        rating: 4.5,
        requiredVerifications: ["nationality"],
      },
      {
        code: "hotel-shinsaibashi-d",
        name: "心斎橋ビジネスホテルD",
        city: "大阪",
        pricePerNight: 6800,
        rating: 3.2,
        requiredVerifications: [],
      },
      {
        code: "hotel-tennoji-resident",
        name: "天王寺ホテルE",
        city: "大阪",
        pricePerNight: 5500,
        rating: 3.8,
        requiredVerifications: ["residence"],
      },
      {
        code: "hotel-universalport-g",
        name: "ユニバーサルポートホテルG",
        city: "大阪",
        pricePerNight: 22000,
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
        price: 6000,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "restaurant-cafe-nakanoshima",
        kind: "restaurant",
        name: "中之島カフェ",
        city: "大阪",
        genre: "カフェ",
        price: 1200,
        requiredVerifications: [],
      },
      {
        code: "restaurant-chinese-chinka",
        kind: "restaurant",
        name: "中華料理 陳家",
        city: "大阪",
        genre: "中華",
        price: 8000,
        requiredVerifications: [],
      },
      {
        code: "restaurant-chinese-tenshin",
        kind: "restaurant",
        name: "中華 天心",
        city: "大阪",
        genre: "中華",
        price: 2200,
        requiredVerifications: [],
      },
      {
        code: "restaurant-craftbeer-nakazaki",
        kind: "restaurant",
        name: "中崎町クラフトビール醸造所",
        city: "大阪",
        genre: "ビール",
        price: 4500,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "restaurant-izakaya-tenma",
        kind: "restaurant",
        name: "天満 立ち飲み居酒屋 大和",
        city: "大阪",
        genre: "居酒屋",
        price: 3000,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "restaurant-kaiseki-matsukaze",
        kind: "restaurant",
        name: "難波 会席 松風（免税対応）",
        city: "大阪",
        genre: "和食",
        price: 12000,
        requiredVerifications: ["nationality"],
      },
      {
        code: "restaurant-okonomiyaki-fuku",
        kind: "restaurant",
        name: "お好み焼き 福",
        city: "大阪",
        genre: "粉もん",
        price: 1800,
        requiredVerifications: [],
      },
      {
        code: "restaurant-sushi-takumi",
        kind: "restaurant",
        name: "北新地 寿司 匠",
        city: "大阪",
        genre: "和食",
        price: 15000,
        requiredVerifications: [],
      },
      {
        code: "restaurant-takoyaki-honpo",
        kind: "restaurant",
        name: "道頓堀 たこ焼き本舗",
        city: "大阪",
        genre: "粉もん",
        price: 800,
        requiredVerifications: [],
      },
      {
        code: "leisure-inbound-guide-tour",
        kind: "leisure",
        name: "訪日外国人限定 大阪ガイドツアー",
        city: "大阪",
        genre: "tour",
        price: 3500,
        requiredVerifications: ["nationality"],
      },
      {
        code: "leisure-kaiyukan",
        kind: "leisure",
        name: "海遊館",
        city: "大阪",
        genre: "aquarium",
        price: 2700,
        requiredVerifications: [],
      },
      {
        code: "leisure-kyocera-baseball",
        kind: "leisure",
        name: "京セラドーム大阪 野球観戦",
        city: "大阪",
        genre: "baseball",
        price: 5500,
        requiredVerifications: [],
      },
      {
        code: "leisure-nakanoshima-museum",
        kind: "leisure",
        name: "大阪中之島美術館",
        city: "大阪",
        genre: "art",
        price: 1800,
        requiredVerifications: [],
      },
      {
        code: "leisure-namba-night-theater",
        kind: "leisure",
        name: "ミナミ ナイトシアター 深夜公演（18歳以上）",
        city: "大阪",
        genre: "show",
        price: 6500,
        requiredVerifications: ["age"],
        ageLimit: 18,
      },
      {
        code: "leisure-osaka-castle",
        kind: "leisure",
        name: "大阪城天守閣",
        city: "大阪",
        genre: "history",
        price: 600,
        requiredVerifications: [],
      },
      {
        code: "leisure-osaka-city-museum",
        kind: "leisure",
        name: "大阪市立美術館",
        city: "大阪",
        genre: "art",
        price: 1400,
        requiredVerifications: [],
      },
      {
        code: "leisure-osaka-resident-pass",
        kind: "leisure",
        name: "大阪周遊パス（大阪府民割引）",
        city: "大阪",
        genre: "sightseeing",
        price: 2000,
        requiredVerifications: ["residence"],
      },
      {
        code: "leisure-umeda-burlesque",
        kind: "leisure",
        name: "大阪バーレスクショー（20歳以上・ドリンク付）",
        city: "大阪",
        genre: "show",
        price: 8800,
        requiredVerifications: ["age"],
        ageLimit: 20,
      },
      {
        code: "leisure-yodoko-soccer",
        kind: "leisure",
        name: "ヨドコウ桜スタジアム サッカー観戦",
        city: "大阪",
        genre: "soccer",
        price: 4200,
        requiredVerifications: [],
      },
    ],
  };
};

/**
 * メモリ上の行を読み書きするカタログ
 *
 * 秘書の `FareCatalogPort` と設定画面の `CatalogSettingsPort` を同じ行で満たすので、設定画面で料金を変えたり行を無効にしたりすると次の提案に効く
 * 行は作るときに seed の template から作り、再起動すると seed に戻る
 * `findOffers` は有効な行の現地時刻にクエリの日付を当てはめる
 * 行の id は確定旅程の明細に写す DB の行ではないので `resolveServiceIds` は必ず失敗する (demo では確定旅程を DB に書かず、Fake の store がメモリに持つ)
 */
export const createFakeCatalog = (
  seed: FakeCatalogSeed,
  ids: FakeCatalogIds,
): FareCatalogPort & CatalogSettingsPort => {
  const state = initialStateOf(seed, ids);

  return {
    listDestinations: async () => ok(destinationsOf(state)),
    findOffers: async (query) => findOffers(state, query),
    resolveServiceIds: async (codes) =>
      err({
        kind: "unavailable",
        cause: { reason: "fakeCatalogHasNoServiceIds", codes },
      }),
    listServices: async (filters) => ok(serviceListOf(state, filters)),
    getTransportService: async (id) =>
      ok(state.transport.find((row) => row.id === id)),
    getPlaceService: async (id) =>
      ok(state.places.find((row) => row.id === id)),
    listSupportedCities: async () => ok(destinationsOf(state)),
    listHomeOptions: async () => ok(homeOptionsOf(state)),
    listGenreOptions: async () => ok(genreOptionsOf(state)),
    createTransportService: async (input) => createTransport(state, ids, input),
    updateTransportService: async (id, input) =>
      updateTransport(state, ids, id, input),
    disableTransportService: async (id, updatedAt) =>
      disableTransport(state, ids, id, updatedAt),
    createPlaceService: async (input) => createPlace(state, ids, input),
    updatePlaceService: async (id, input) => updatePlace(state, ids, id, input),
    disablePlaceService: async (id, updatedAt) =>
      disablePlace(state, ids, id, updatedAt),
  };
};
