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
