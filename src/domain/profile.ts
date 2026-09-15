import type { Result } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type { IsoDate, UserId } from "./identifiers";

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
 * プロフィールの port
 *
 * Wave 1 で秘書が要るのは生年月日だけ
 * 好み (T4-2) は後から足す
 * real は #16 の Neon のプロフィール、Fake は固定値
 */
export type ProfilePort = {
  readBirthDate: ReadBirthDate;
};
