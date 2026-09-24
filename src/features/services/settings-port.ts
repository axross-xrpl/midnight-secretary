import type { Result } from "@/lib/result";
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type { ServiceCategory } from "./constants";
import type {
  PlaceServiceCreateInput,
  PlaceServiceDetailDto,
  PlaceServiceUpdateInput,
  ServiceListItemDto,
  TransportServiceCreateInput,
  TransportServiceDetailDto,
  TransportServiceUpdateInput,
} from "./schemas";

/**
 * サービス一覧の絞り込み
 *
 * `active` を省くと有効な行だけ、`"all"` なら無効な行も含める
 */
export type ServiceListFilters = {
  category?: ServiceCategory;
  city?: string;
  query?: string;
  active?: boolean | "all";
};

/**
 * 設定画面の読み取りで起こりうる失敗
 */
export type ServiceReadError = { kind: "unavailable"; cause: unknown };

/**
 * 設定画面の書き込みで起こりうる失敗
 *
 * `unavailable` は分類できない DB の失敗で、Route Handler は 500 にする
 */
export type ServiceWriteError =
  | { kind: "notFound" }
  | { kind: "conflict" }
  | { kind: "immutableCategory" }
  | { kind: "duplicateCode" }
  | { kind: "constraintViolation" }
  | { kind: "unavailable"; cause: unknown };

/**
 * 絞り込みに合うサービスを、種別の論理順、種別の中は名前順で一覧する
 */
export type ListServices = (
  filters: ServiceListFilters,
) => Promise<Result<ServiceListItemDto[], ServiceReadError>>;

/**
 * 交通 1 件を id で引く (無ければ undefined)
 */
export type GetTransportService = (
  id: string,
) => Promise<Result<TransportServiceDetailDto | undefined, ServiceReadError>>;

/**
 * 場所系 1 件を id で引く (無ければ undefined)
 */
export type GetPlaceService = (
  id: string,
) => Promise<Result<PlaceServiceDetailDto | undefined, ServiceReadError>>;

/**
 * 有効な交通の到着都市を、重複なしの昇順で一覧する
 */
export type ListSupportedCities = () => Promise<
  Result<string[], ServiceReadError>
>;

/**
 * 拠点として選べる都市と起点を、有効な交通の出発地から一覧する
 */
export type ListHomeOptions = () => Promise<
  Result<HomeOption[], ServiceReadError>
>;

/**
 * 好み・趣味に選べるジャンルを、有効な飲食・レジャーから一覧する
 */
export type ListGenreOptions = () => Promise<
  Result<GenreOptions, ServiceReadError>
>;

/**
 * 交通を 1 件登録する
 */
export type CreateTransportService = (
  input: TransportServiceCreateInput,
) => Promise<Result<TransportServiceDetailDto, ServiceWriteError>>;

/**
 * 交通 1 件を、取得時の `updatedAt` で同時編集を検知しながら更新する
 */
export type UpdateTransportService = (
  id: string,
  input: TransportServiceUpdateInput,
) => Promise<Result<TransportServiceDetailDto, ServiceWriteError>>;

/**
 * 交通 1 件を、取得時の `updatedAt` で同時編集を検知しながら無効にする
 */
export type DisableTransportService = (
  id: string,
  updatedAt: string,
) => Promise<Result<TransportServiceDetailDto, ServiceWriteError>>;

/**
 * 場所系を 1 件登録する
 */
export type CreatePlaceService = (
  input: PlaceServiceCreateInput,
) => Promise<Result<PlaceServiceDetailDto, ServiceWriteError>>;

/**
 * 場所系 1 件を、取得時の `updatedAt` で同時編集を検知しながら更新する
 */
export type UpdatePlaceService = (
  id: string,
  input: PlaceServiceUpdateInput,
) => Promise<Result<PlaceServiceDetailDto, ServiceWriteError>>;

/**
 * 場所系 1 件を、取得時の `updatedAt` で同時編集を検知しながら無効にする
 */
export type DisablePlaceService = (
  id: string,
  updatedAt: string,
) => Promise<Result<PlaceServiceDetailDto, ServiceWriteError>>;

/**
 * 設定画面がサービス (交通と場所) を管理する port
 *
 * 秘書の `FareCatalogPort` と同じ入れ物を別の面から見たもので、fake では同じインスタンスが両方を満たす
 * 値は画面の DTO の形で返す (JSON の境界なので null を含む)
 */
export type CatalogSettingsPort = {
  listServices: ListServices;
  getTransportService: GetTransportService;
  getPlaceService: GetPlaceService;
  listSupportedCities: ListSupportedCities;
  listHomeOptions: ListHomeOptions;
  listGenreOptions: ListGenreOptions;
  createTransportService: CreateTransportService;
  updateTransportService: UpdateTransportService;
  disableTransportService: DisableTransportService;
  createPlaceService: CreatePlaceService;
  updatePlaceService: UpdatePlaceService;
  disablePlaceService: DisablePlaceService;
};
