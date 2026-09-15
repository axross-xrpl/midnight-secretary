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
