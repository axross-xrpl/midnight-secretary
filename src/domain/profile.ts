import type { PlanningProfile } from "@/features/profile/feasibility";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import type { Result } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type { IsoDate, UserId } from "./identifiers";
import type { TravelerPreferences } from "./plan";

/**
 * プロフィールの読み取りで起こりうる失敗
 *
 * 行の値が暦日として読めないときは SchemaError として表れる
 */
export type ProfileError =
  | { kind: "unavailable"; cause: unknown }
  | SchemaError;

/**
 * ユーザの生年月日 (未登録なら undefined)
 */
export type ReadBirthDate = (
  userId: UserId,
) => Promise<Result<IsoDate | undefined, ProfileError>>;

/**
 * 出張者の好み (プロフィールが無ければ undefined)
 */
export type ReadPreferences = (
  userId: UserId,
) => Promise<Result<TravelerPreferences | undefined, ProfileError>>;

/**
 * プロフィールの port
 *
 * 秘書が要るのは年齢確認のための生年月日と、候補を選ぶための好み
 * real は #16 の Neon のプロフィール、Fake は固定値
 */
export type ProfilePort = {
  readBirthDate: ReadBirthDate;
  readPreferences: ReadPreferences;
};

/**
 * プロフィールの書き込みで起こりうる失敗
 *
 * `notFound` は更新しようとした行が無いとき、`conflict` は取得時の `updatedAt` と食い違ったとき (同時編集)
 * `unavailable` は DB に届かなかったときで、原因をそのまま持つ
 */
export type ProfileWriteError =
  | { kind: "notFound" }
  | { kind: "conflict" }
  | { kind: "duplicateEmail" }
  | { kind: "constraintViolation" }
  | { kind: "unavailable"; cause: unknown };

/**
 * プロフィールの行の持ち主
 *
 * どちらもセッション由来で、クライアントからは受け取らない
 */
export type ProfileOwner = {
  userId: UserId;
  email: string;
};

/**
 * 画面用のプロフィール (行が無ければ undefined)
 */
export type ReadProfile = (
  userId: UserId,
) => Promise<Result<ProfileDto | undefined, ProfileError>>;

/**
 * 手配に使うプロフィール (行が無ければ undefined)
 *
 * 本人確認の判定に要る `nationality` を含み、表示だけの項目は持たない
 */
export type ReadPlanningProfile = (
  userId: UserId,
) => Promise<Result<PlanningProfile | undefined, ProfileError>>;

/**
 * プロフィールを保存する
 *
 * `input.updatedAt` が無ければ未登録として作り、あれば同時編集を検知しつつ書き換える
 */
export type SaveProfile = (
  owner: ProfileOwner,
  input: ProfileSaveInput,
) => Promise<Result<ProfileDto, ProfileWriteError>>;

/**
 * 設定画面から見たプロフィール
 *
 * `ProfilePort` と同じ行を画面の形で読み書きする
 * 同じ adapter が両方を実装し、`SECRETARY_PROFILE` で一緒に切り替わる
 */
export type ProfileSettingsPort = {
  readProfile: ReadProfile;
  readPlanningProfile: ReadPlanningProfile;
  saveProfile: SaveProfile;
};
