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
 * カタログが提示する予約可能な交通区間 1 件
 *
 * `payee` は事業者の受取先で、支払いはこの候補ごとにここへ送る
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
};

/**
 * カタログが提示する予約可能な宿泊 1 件
 *
 * 価格は滞在全体分
 * `payee` は事業者の受取先で、支払いはこの候補ごとにここへ送る
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
 */
export type OfferSet = {
  outbound: readonly TransportOffer[];
  inbound: readonly TransportOffer[];
  lodging: readonly LodgingOffer[];
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
 * seed 済みの運賃データへの読み取りアクセス (全ユーザで共有)
 */
export type FareCatalogPort = {
  listDestinations: ListDestinations;
  findOffers: FindOffers;
};
