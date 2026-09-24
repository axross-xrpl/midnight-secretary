import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type { ServiceCategory } from "@/features/services/constants";
import type {
  PlaceServiceCreateInput,
  PlaceServiceUpdateInput,
  TransportServiceCreateInput,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import type { Result } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type {
  IsoDate,
  IsoDateTime,
  OfferId,
  WalletAddress,
} from "./identifiers";
import type { Money } from "./money";

/**
 * seed 済みの運賃データに含まれる交通手段
 */
export type TransportMode = "rail" | "air";

/**
 * 利用者に求められる本人属性の確認
 *
 * 候補を除外する条件なので、プランナーに渡す候補が持つ
 */
export type VerificationKind = "age" | "nationality" | "residence";

/**
 * 拠点から目的地までの所要と総額
 *
 * 乗車時間だけでは交通手段を比べられない。駅・空港までの移動と乗車前後の待ちを含めて
 * はじめて「速いが高い / 遅いが安い」の逆転が見える
 * `totalPrice` は運賃に前後アクセスの運賃を足したもので、支払い先が違うため `price` とは別に持つ
 */
export type DoorToDoor = {
  totalMin: number;
  totalPrice: Money;
};

/**
 * カタログが提示する予約可能な交通区間 1 件
 *
 * `payee` は事業者の受取先で、支払いはこの候補ごとにここへ送る
 * `doorToDoor` は内訳を持つカタログだけが埋める
 */
export type TransportOffer = {
  id: OfferId;
  mode: TransportMode;
  vendor: string;
  payee: WalletAddress;
  origin: string;
  destination: string;
  departAt: IsoDateTime;
  arriveAt: IsoDateTime;
  price: Money;
  doorToDoor?: DoorToDoor;
};

/**
 * カタログが提示する予約可能な宿泊 1 件
 *
 * 価格は滞在全体分
 * `payee` は事業者の受取先で、支払いはこの候補ごとにここへ送る
 * `rating` と `requiredVerifications` は、それを持つカタログだけが埋める
 */
export type LodgingOffer = {
  id: OfferId;
  vendor: string;
  payee: WalletAddress;
  name: string;
  city: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  price: Money;
  rating?: number;
  requiredVerifications?: readonly VerificationKind[];
};

/**
 * 現地で消費するサービスの種類
 */
export type PlaceOfferKind = "restaurant" | "leisure";

/**
 * カタログが提示する現地のサービス 1 件 (飲食・レジャー)
 *
 * 交通と宿泊と違い滞在全体の日付を持たない。価格は 1 人 / 1 枚あたり
 * `genre` は利用者の好み・趣味と突き合わせるために持つ
 * `ageLimit` は `requiredVerifications` に `age` を含むときだけ入る
 */
export type PlaceOffer = {
  id: OfferId;
  kind: PlaceOfferKind;
  payee: WalletAddress;
  name: string;
  city: string;
  genre?: string;
  price: Money;
  requiredVerifications: readonly VerificationKind[];
  ageLimit?: number;
};

/**
 * アプリケーションがカタログに問い合わせる条件
 *
 * 宿泊数は 2 つの日付から決まる
 */
export type OfferQuery = {
  origin: string;
  destination: string;
  departOn: IsoDate;
  returnOn: IsoDate;
};

/**
 * プランナーが選んでよい候補の全体
 *
 * この集合の外にあるものは拒否される
 * `dining` と `leisure` は目的地で消費するサービスで、カタログが持たなければ空になる
 */
export type OfferSet = {
  outbound: readonly TransportOffer[];
  inbound: readonly TransportOffer[];
  lodging: readonly LodgingOffer[];
  dining: readonly PlaceOffer[];
  leisure: readonly PlaceOffer[];
};

/**
 * 料金表で起こりうる失敗
 */
export type CatalogError =
  | { kind: "unknownDestination"; destination: string }
  | { kind: "unavailable"; cause: unknown }
  | SchemaError;

/**
 * カタログが運賃を持つ目的地を一覧する
 */
export type ListDestinations = () => Promise<
  Result<readonly string[], CatalogError>
>;

/**
 * 往復の交通と 2 つの日付の間の宿泊の候補を探す
 */
export type FindOffers = (
  query: OfferQuery,
) => Promise<Result<OfferSet, CatalogError>>;

/**
 * 候補 id (カタログの code) を、サービス行そのものの id に引き直す
 *
 * 確定旅程の明細は `code` ではなくサービス行の id を持つので、写すときにここを通す
 * 引けない code が 1 つでもあれば失敗する (存在しない行を指す明細を作らない)
 */
export type ResolveServiceId = (
  codes: readonly OfferId[],
) => Promise<Result<Record<OfferId, string>, CatalogError>>;

/**
 * seed 済みの運賃データへの読み取りアクセス (全ユーザで共有)
 */
export type FareCatalogPort = {
  listDestinations: ListDestinations;
  findOffers: FindOffers;
  resolveServiceIds: ResolveServiceId;
};

const withoutAgeVerification = (offer: PlaceOffer): boolean => {
  return !offer.requiredVerifications.includes("age");
};

/**
 * 飲食の候補から年齢確認を要するものを除いた候補の集合
 *
 * 年齢確認が通らなかったときの作り直しに使う
 * `adultRequirementOf` が見るのは飲食だけなので、レジャーはそのまま
 */
export const withoutAgeRestrictedDining = (offers: OfferSet): OfferSet => {
  return { ...offers, dining: offers.dining.filter(withoutAgeVerification) };
};

/**
 * `transport_services` の 1 行
 *
 * サービス管理画面の詳細と、書き込みの戻り値
 * DB と JSON の境界の形なので、空の列は undefined ではなく null のまま持つ (画面のスキーマも nullable)
 * 時刻は "HH:MM" または "HH:MM:SS"
 */
export type TransportServiceRow = {
  id: string;
  code: string;
  name: string;
  mode: string;
  fromCity: string;
  toCity: string;
  fromSpot: string;
  toSpot: string;
  departTime: string | null;
  arriveTime: string | null;
  durationMin: number;
  price: number;
  originAccessMin: number;
  boardingBufferMin: number;
  arrivalBufferMin: number | null;
  destinationAccessMin: number;
  accessFare: number | null;
  seatClass: string | null;
  walletAddress: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * `place_services` の 1 行 (宿泊・飲食・レジャー)
 *
 * `TransportServiceRow` と同じく境界の形で、kind ごとに使わない列は null
 */
export type PlaceServiceRow = {
  id: string;
  code: string;
  kind: string;
  name: string;
  city: string;
  address: string;
  nearestStation: string;
  stationAccessMin: number;
  price: number;
  requiredVerifications: string[];
  itemName: string | null;
  genre: string | null;
  openFrom: string | null;
  openTo: string | null;
  checkinFrom: string | null;
  checkoutBy: string | null;
  rating: number | null;
  breakfastIncluded: boolean | null;
  hasAlcohol: boolean | null;
  seats: string | null;
  ageLimit: number | null;
  walletAddress: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * サービス一覧の絞り込み
 *
 * `active` を省くと有効な行だけ、`"all"` で無効な行も含める
 * `city` は交通なら出発・到着のどちらか、場所系なら所在地に当てる
 * `query` は名称・code・地点名の部分一致 (大文字小文字を区別しない)
 */
export type ServiceListFilters = {
  category?: ServiceCategory;
  city?: string;
  query?: string;
  active?: boolean | "all";
};

/**
 * サービス一覧の 1 行
 *
 * 交通と場所系を 1 つの形に揃えたもの。種別ごとに無い値は null
 */
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

/**
 * サービスの書き込みで起こりうる失敗
 *
 * `conflict` は取得時の `updatedAt` と行が食い違ったとき (同時編集)
 * `immutableCategory` は作成後に種別を変えようとしたとき
 * `unavailable` は DB に届かなかったときで、原因をそのまま持つ
 */
export type ServiceWriteError =
  | { kind: "notFound" }
  | { kind: "conflict" }
  | { kind: "immutableCategory" }
  | { kind: "duplicateCode" }
  | { kind: "constraintViolation" }
  | { kind: "unavailable"; cause: unknown };

/**
 * 絞り込みに合うサービスを、種別の論理順 (鉄道・航空・宿泊・飲食・レジャー) に名前順で返す
 */
export type ListServices = (
  filters: ServiceListFilters,
) => Promise<Result<readonly ServiceListItem[], CatalogError>>;

/**
 * 交通 1 行を id で引く (無ければ undefined)
 */
export type GetTransportService = (
  id: string,
) => Promise<Result<TransportServiceRow | undefined, CatalogError>>;

/**
 * 場所系 1 行を id で引く (無ければ undefined)
 */
export type GetPlaceService = (
  id: string,
) => Promise<Result<PlaceServiceRow | undefined, CatalogError>>;

/**
 * 拠点として選べる都市と起点を、有効な交通の出発地から導く
 */
export type ListHomeOptions = () => Promise<
  Result<readonly HomeOption[], CatalogError>
>;

/**
 * 好み・趣味に選べるジャンルを、有効な飲食・レジャーの genre から導く
 */
export type ListGenreOptions = () => Promise<
  Result<GenreOptions, CatalogError>
>;

/**
 * 交通を 1 行追加する
 */
export type CreateTransportService = (
  input: TransportServiceCreateInput,
) => Promise<Result<TransportServiceRow, ServiceWriteError>>;

/**
 * 交通 1 行を、取得時の `updatedAt` が一致するときだけ書き換える
 */
export type UpdateTransportService = (
  id: string,
  input: TransportServiceUpdateInput,
) => Promise<Result<TransportServiceRow, ServiceWriteError>>;

/**
 * 交通 1 行を無効にする (行は消さない)
 */
export type DisableTransportService = (
  id: string,
  updatedAt: string,
) => Promise<Result<TransportServiceRow, ServiceWriteError>>;

/**
 * 場所系を 1 行追加する
 */
export type CreatePlaceService = (
  input: PlaceServiceCreateInput,
) => Promise<Result<PlaceServiceRow, ServiceWriteError>>;

/**
 * 場所系 1 行を、取得時の `updatedAt` が一致するときだけ書き換える
 */
export type UpdatePlaceService = (
  id: string,
  input: PlaceServiceUpdateInput,
) => Promise<Result<PlaceServiceRow, ServiceWriteError>>;

/**
 * 場所系 1 行を無効にする (行は消さない)
 */
export type DisablePlaceService = (
  id: string,
  updatedAt: string,
) => Promise<Result<PlaceServiceRow, ServiceWriteError>>;

/**
 * サービス管理画面から見たカタログ
 *
 * `FareCatalogPort` と同じ行を、候補ではなく行のまま読み書きする
 * 同じ adapter が両方を実装し、`SECRETARY_CATALOG` で一緒に切り替わる
 * `listDestinations` は `FareCatalogPort` と同じもので、拠点に選べる都市の一覧にも使う
 */
export type CatalogManagementPort = {
  listDestinations: ListDestinations;
  listServices: ListServices;
  getTransportService: GetTransportService;
  getPlaceService: GetPlaceService;
  listHomeOptions: ListHomeOptions;
  listGenreOptions: ListGenreOptions;
  createTransportService: CreateTransportService;
  updateTransportService: UpdateTransportService;
  disableTransportService: DisableTransportService;
  createPlaceService: CreatePlaceService;
  updatePlaceService: UpdatePlaceService;
  disablePlaceService: DisablePlaceService;
};
