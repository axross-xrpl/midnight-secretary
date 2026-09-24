import type {
  CatalogError,
  CatalogManagementPort,
  FareCatalogPort,
  OfferQuery,
  OfferSet,
  PlaceOfferKind,
  PlaceServiceRow,
  ServiceListFilters,
  ServiceWriteError,
  TransportMode,
  TransportServiceRow,
  VerificationKind,
} from "@/domain/catalog";
import { nightsBetween } from "@/domain/dates";
import type { IsoDate } from "@/domain/identifiers";
import type {
  PlaceServiceCreateInput,
  PlaceServiceUpdateInput,
  TransportServiceCreateInput,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import {
  genreOptionsOf,
  homeOptionsOf,
  lodgingOfferFor,
  matchesPlaceFilters,
  matchesTransportFilters,
  matchesUpdatedAt,
  placeOfferOf,
  placeValuesOf,
  serviceListOf,
  transportOfferOn,
  transportValuesOf,
} from "./rows";

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
  destinations: readonly string[];
  transport: readonly TransportTemplate[];
  lodging: readonly LodgingTemplate[];
  places: readonly PlaceTemplate[];
};

/**
 * Fake が採番するものと時計 (テストでは閉じたカウンタと止まった時計、runtime では randomUUID と実時刻)
 *
 * 行の id は Route Handler が uuid として検査するので、その形で返す
 */
export type FakeCatalogIds = {
  newServiceId: () => string;
  now: () => Date;
};

// 受取先は売り手側の 2 つ。DB の行と同じダミー値を使う
const TRANSPORT_PAYEE = "mn_shield-addr_test1demo-transport-seller";

const SERVICE_PAYEE = "mn_shield-addr_test1demo-service-seller";

// seed の template が持たない列の既定値 (管理画面に出すだけで、候補には効かない)
const STATION_ACCESS_MIN = 5;

type FakeCatalogState = {
  transport: readonly TransportServiceRow[];
  places: readonly PlaceServiceRow[];
};

const transportRowOf = (
  template: TransportTemplate,
  ids: FakeCatalogIds,
): TransportServiceRow => {
  const now = ids.now();

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
    createdAt: now,
    updatedAt: now,
  };
};

// kind ごとに使わない列は null (DB の seed と同じ決まり)
const EMPTY_PLACE_COLUMNS = {
  itemName: null,
  genre: null,
  openFrom: null,
  openTo: null,
  checkinFrom: null,
  checkoutBy: null,
  rating: null,
  breakfastIncluded: null,
  hasAlcohol: null,
  seats: null,
  ageLimit: null,
};

const lodgingRowOf = (
  template: LodgingTemplate,
  ids: FakeCatalogIds,
): PlaceServiceRow => {
  const now = ids.now();

  return {
    ...EMPTY_PLACE_COLUMNS,
    id: ids.newServiceId(),
    code: template.code,
    kind: "hotel",
    name: template.name,
    city: template.city,
    address: `${template.city}市内`,
    nearestStation: `${template.city}駅`,
    stationAccessMin: STATION_ACCESS_MIN,
    price: template.pricePerNight,
    requiredVerifications: [...template.requiredVerifications],
    itemName: "シングル",
    checkinFrom: "15:00",
    checkoutBy: "10:00",
    rating: template.rating,
    breakfastIncluded: false,
    walletAddress: SERVICE_PAYEE,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
};

const placeRowOf = (
  template: PlaceTemplate,
  ids: FakeCatalogIds,
): PlaceServiceRow => {
  const now = ids.now();
  const requiresAge = template.requiredVerifications.includes("age");

  return {
    ...EMPTY_PLACE_COLUMNS,
    id: ids.newServiceId(),
    code: template.code,
    kind: template.kind,
    name: template.name,
    city: template.city,
    address: `${template.city}市内`,
    nearestStation: `${template.city}駅`,
    stationAccessMin: STATION_ACCESS_MIN,
    price: template.price,
    requiredVerifications: [...template.requiredVerifications],
    genre: template.genre,
    ...(template.kind === "restaurant"
      ? { itemName: "おすすめコース", hasAlcohol: requiresAge }
      : {}),
    openFrom: template.kind === "restaurant" ? "11:00" : "10:00",
    openTo: template.kind === "restaurant" ? "22:00" : "18:00",
    ageLimit: template.ageLimit ?? null,
    walletAddress: SERVICE_PAYEE,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
};

const seedState = (
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

const activeOnly = <T extends { active: boolean }>(row: T): boolean => {
  return row.active;
};

const transportBetween = (
  state: FakeCatalogState,
  origin: string,
  destination: string,
  date: IsoDate,
) => {
  return state.transport
    .filter(activeOnly)
    .filter(
      (row) =>
        matchesPlaceName(row.fromCity, row.fromSpot, origin) &&
        matchesPlaceName(row.toCity, row.toSpot, destination),
    )
    .map((row) => transportOfferOn(row, date))
    .filter((offer) => offer !== undefined);
};

const activePlacesOf = (
  state: FakeCatalogState,
  kind: string,
  city: string,
): readonly PlaceServiceRow[] => {
  return state.places
    .filter(activeOnly)
    .filter((row) => row.kind === kind && row.city === city);
};

const findOffers = (
  state: FakeCatalogState,
  destinations: readonly string[],
  query: OfferQuery,
): Result<OfferSet, CatalogError> => {
  if (!destinations.includes(query.destination)) {
    return err({ kind: "unknownDestination", destination: query.destination });
  }

  const nights = nightsBetween(query.departOn, query.returnOn);
  const lodging =
    nights > 0 ? activePlacesOf(state, "hotel", query.destination) : [];

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
    lodging: lodging.map((row) => lodgingOfferFor(row, query, nights)),
    dining: activePlacesOf(state, "restaurant", query.destination).map((row) =>
      placeOfferOf(row, "restaurant"),
    ),
    leisure: activePlacesOf(state, "leisure", query.destination).map((row) =>
      placeOfferOf(row, "leisure"),
    ),
  });
};

// 行はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const putTransport = (
  state: FakeCatalogState,
  rows: readonly TransportServiceRow[],
): void => {
  state.transport = rows;
};

const putPlaces = (
  state: FakeCatalogState,
  rows: readonly PlaceServiceRow[],
): void => {
  state.places = rows;
};

const hasCode = <T extends { code: string }>(
  rows: readonly T[],
  code: string,
): boolean => {
  return rows.some((row) => row.code === code);
};

const replaced = <T extends { id: string }>(
  rows: readonly T[],
  next: T,
): T[] => {
  return rows.map((row) => (row.id === next.id ? next : row));
};

const createTransport = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  input: TransportServiceCreateInput,
): Result<TransportServiceRow, ServiceWriteError> => {
  if (hasCode(state.transport, input.code)) {
    return err({ kind: "duplicateCode" });
  }

  const now = ids.now();
  const row: TransportServiceRow = {
    id: ids.newServiceId(),
    ...transportValuesOf(input),
    createdAt: now,
    updatedAt: now,
  };

  putTransport(state, [...state.transport, row]);

  return ok(row);
};

const updateTransport = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  input: TransportServiceUpdateInput,
): Result<TransportServiceRow, ServiceWriteError> => {
  const current = state.transport.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (current.mode !== input.mode) {
    return err({ kind: "immutableCategory" });
  }

  if (!matchesUpdatedAt(current, input.updatedAt)) {
    return err({ kind: "conflict" });
  }

  if (current.code !== input.code && hasCode(state.transport, input.code)) {
    return err({ kind: "duplicateCode" });
  }

  const row: TransportServiceRow = {
    ...current,
    ...transportValuesOf(input),
    updatedAt: ids.now(),
  };

  putTransport(state, replaced(state.transport, row));

  return ok(row);
};

const disableTransport = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  updatedAt: string,
): Result<TransportServiceRow, ServiceWriteError> => {
  const current = state.transport.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (!matchesUpdatedAt(current, updatedAt)) {
    return err({ kind: "conflict" });
  }

  const row: TransportServiceRow = {
    ...current,
    active: false,
    updatedAt: ids.now(),
  };

  putTransport(state, replaced(state.transport, row));

  return ok(row);
};

const createPlace = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  input: PlaceServiceCreateInput,
): Result<PlaceServiceRow, ServiceWriteError> => {
  if (hasCode(state.places, input.code)) {
    return err({ kind: "duplicateCode" });
  }

  const now = ids.now();
  const row: PlaceServiceRow = {
    id: ids.newServiceId(),
    ...placeValuesOf(input),
    createdAt: now,
    updatedAt: now,
  };

  putPlaces(state, [...state.places, row]);

  return ok(row);
};

const updatePlace = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  input: PlaceServiceUpdateInput,
): Result<PlaceServiceRow, ServiceWriteError> => {
  const current = state.places.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (current.kind !== input.kind) {
    return err({ kind: "immutableCategory" });
  }

  if (!matchesUpdatedAt(current, input.updatedAt)) {
    return err({ kind: "conflict" });
  }

  if (current.code !== input.code && hasCode(state.places, input.code)) {
    return err({ kind: "duplicateCode" });
  }

  const row: PlaceServiceRow = {
    ...current,
    ...placeValuesOf(input),
    updatedAt: ids.now(),
  };

  putPlaces(state, replaced(state.places, row));

  return ok(row);
};

const disablePlace = (
  state: FakeCatalogState,
  ids: FakeCatalogIds,
  id: string,
  updatedAt: string,
): Result<PlaceServiceRow, ServiceWriteError> => {
  const current = state.places.find((row) => row.id === id);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  if (!matchesUpdatedAt(current, updatedAt)) {
    return err({ kind: "conflict" });
  }

  const row: PlaceServiceRow = {
    ...current,
    active: false,
    updatedAt: ids.now(),
  };

  putPlaces(state, replaced(state.places, row));

  return ok(row);
};

const listServices = (state: FakeCatalogState, filters: ServiceListFilters) => {
  return serviceListOf(
    state.transport.filter((row) => matchesTransportFilters(row, filters)),
    state.places.filter((row) => matchesPlaceFilters(row, filters)),
  );
};

// 採番を省いたときの既定 (テストでは決定的な uuid、時計は実時刻)
const defaultIds = (): FakeCatalogIds => {
  const state = { issued: 0 };

  return {
    newServiceId: () => {
      state.issued = state.issued + 1;

      return `00000000-0000-4000-8000-${String(state.issued).padStart(12, "0")}`;
    },
    now: () => new Date(),
  };
};

/**
 * NeonDB の有効な行を写した seed
 *
 * DB を用意せずに動かすためのもので、カタログの port が fake のときに常に使う
 * 行を足すときは DB 側の seed と同じ値にする。ずれると fake と real で提案が変わる
 */
export const seedCatalog = (): FakeCatalogSeed => {
  return {
    destinations: ["大阪", "東京"],

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
 * seed をメモリの行にして読み書きするカタログ
 *
 * `findOffers` は有効な行の現地時刻にクエリの日付を当てはめる (Neon と同じ行の形を経由する)
 * 管理画面の書き込みはこのメモリの行に入り、候補にもそのまま現れる。再起動すると seed に戻る
 * `resolveServiceIds` は必ず失敗する (demo では確定旅程を DB に書かず、Fake の store がメモリに持つ)
 */
export const createFakeCatalog = (
  seed: FakeCatalogSeed,
  ids: FakeCatalogIds = defaultIds(),
): FareCatalogPort & CatalogManagementPort => {
  const state = seedState(seed, ids);

  return {
    listDestinations: async () => ok(seed.destinations),
    findOffers: async (query) => findOffers(state, seed.destinations, query),
    resolveServiceIds: async (codes) =>
      err({
        kind: "unavailable",
        cause: { reason: "fakeCatalogHasNoServiceIds", codes },
      }),
    listServices: async (filters) => ok(listServices(state, filters)),
    getTransportService: async (id) =>
      ok(state.transport.find((row) => row.id === id)),
    getPlaceService: async (id) =>
      ok(state.places.find((row) => row.id === id)),
    listHomeOptions: async () =>
      ok(
        homeOptionsOf(
          state.transport
            .filter(activeOnly)
            .map((row) => ({ city: row.fromCity, spot: row.fromSpot })),
        ),
      ),
    listGenreOptions: async () =>
      ok(genreOptionsOf(state.places.filter(activeOnly))),
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
