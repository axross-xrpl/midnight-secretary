import type { Result } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type { ResolveServiceId } from "./catalog";
import type {
  CalendarEventId,
  IsoDate,
  IsoDateTime,
  MandateId,
  TripId,
  UserId,
  WalletAddress,
} from "./identifiers";
import type { Money } from "./money";
import type { Trip, WrittenTrip } from "./trip";

/**
 * ユーザが秘書に委任した mandate がどれか
 *
 * Wave 1 ではユーザ 1 人につき 1 件
 */
export type MandateLink = {
  mandateId: MandateId;
  linkedAt: IsoDateTime;
};

/**
 * ストアで起こりうる失敗
 *
 * スキーマの parse に失敗した行は SchemaError として表れる
 */
export type StoreError = { kind: "unavailable"; cause: unknown } | SchemaError;

/**
 * ユーザの出張を 1 件読み取る
 *
 * 知らない出張のときは undefined に解決する
 */
export type GetTrip = (
  userId: UserId,
  tripId: TripId,
) => Promise<Result<Trip | undefined, StoreError>>;

/**
 * ユーザの全出張を新しい順に一覧する
 */
export type ListTrips = (
  userId: UserId,
) => Promise<Result<readonly Trip[], StoreError>>;

/**
 * 出張を追加するか置き換える
 *
 * 保存されるのは出張の中にある status
 */
export type PutTrip = (
  userId: UserId,
  trip: Trip,
) => Promise<Result<void, StoreError>>;

/**
 * ユーザの mandate との結び付きを読み取る
 *
 * ユーザがまだ mandate を持たないときは undefined に解決する
 */
export type GetMandateLink = (
  userId: UserId,
) => Promise<Result<MandateLink | undefined, StoreError>>;

/**
 * ユーザの mandate との結び付きを追加するか置き換える
 */
export type PutMandateLink = (
  userId: UserId,
  link: MandateLink,
) => Promise<Result<void, StoreError>>;

/**
 * 確定旅程の明細 1 件の種類
 *
 * 交通は手段、宿は `hotel`、飲食は `restaurant`、レジャーは `leisure`
 */
export type ConfirmedTripItemCategory =
  | "rail"
  | "air"
  | "hotel"
  | "restaurant"
  | "leisure";

/**
 * 確定旅程の明細 1 件
 *
 * 確定した時点の名称・価格・送金先の写しで、サービス行を引き直さなくても表示できる
 * `serviceId` は予約の元になった行の id で、カタログの `code` (`OfferId`) とは別の値なので brand を付けない
 * `startAt` / `endAt` は交通と宿だけが持つ (飲食とレジャーは時刻を持たない)
 */
export type ConfirmedTripItem = {
  seq: number;
  category: ConfirmedTripItemCategory;
  serviceId: string;
  name: string;
  price: Money;
  payee: WalletAddress;
  startAt?: IsoDateTime;
  endAt?: IsoDateTime;
  googleEventId?: CalendarEventId;
};

/**
 * DB に写した確定旅程の 1 件
 *
 * 進行中の `Trip` とは別の型で、`trips` / `trip_items` の行から作れる情報だけを持つ
 * `total` は列に無いので明細の合計から導く
 */
export type ConfirmedTrip = {
  id: TripId;
  title: string;
  originCity: string;
  destinationCity: string;
  startDate: IsoDate;
  endDate?: IsoDate;
  sourceEventId?: CalendarEventId;
  items: readonly ConfirmedTripItem[];
  total: Money;
  confirmedAt: IsoDateTime;
};

/**
 * ユーザの確定旅程を出発日の新しい順に一覧する
 */
export type ListConfirmedTrips = (
  userId: UserId,
) => Promise<Result<readonly ConfirmedTrip[], StoreError>>;

/**
 * 確定した出張を DB に写す
 *
 * 同じ `trip.id` で 2 回呼ばれたら 2 回目は何もしない (書き戻しの再試行に備える)
 */
export type PutConfirmedTrip = (
  userId: UserId,
  trip: WrittenTrip,
  resolveServiceId: ResolveServiceId,
) => Promise<Result<void, StoreError>>;

/**
 * 確定旅程を DB から消す
 *
 * 行ごと消すので取り消せない (動作確認とデモのための操作)
 * 無い id を渡しても成功にする (二重に押されても壊れない)
 */
export type DeleteConfirmedTrip = (
  userId: UserId,
  tripId: TripId,
) => Promise<Result<void, StoreError>>;

/**
 * サーバ側の永続化 (NeonDB)
 *
 * すべての呼び出しはユーザ id で範囲が絞られる
 */
export type SecretaryStore = {
  getTrip: GetTrip;
  listTrips: ListTrips;
  putTrip: PutTrip;
  getMandateLink: GetMandateLink;
  putMandateLink: PutMandateLink;
  listConfirmedTrips: ListConfirmedTrips;
  putConfirmedTrip: PutConfirmedTrip;
  deleteConfirmedTrip: DeleteConfirmedTrip;
};
