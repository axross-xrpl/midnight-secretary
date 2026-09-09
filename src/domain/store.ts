import type { Result } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type { IsoDateTime, MandateId, TripId, UserId } from "./identifiers";
import type { Trip } from "./trip";

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
};
