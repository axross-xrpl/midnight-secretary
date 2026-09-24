import type { Result } from "@/lib/result";
import type { ProfileDto, ProfileSaveInput } from "./schemas";

/**
 * プロフィールの読み取りで起こりうる失敗
 */
export type ProfileReadError = { kind: "unavailable"; cause: unknown };

/**
 * プロフィールの保存で起こりうる失敗
 */
export type ProfileWriteError =
  | { kind: "notFound" }
  | { kind: "conflict" }
  | { kind: "duplicateEmail" }
  | { kind: "constraintViolation" }
  | { kind: "unavailable"; cause: unknown };

/**
 * 保存する行の持ち主 (どちらもセッションから決める)
 */
export type ProfileOwner = {
  userId: string;
  email: string;
};

/**
 * 自分のプロフィールを読む (行が無ければ未登録として undefined)
 */
export type ReadProfile = (
  userId: string,
) => Promise<Result<ProfileDto | undefined, ProfileReadError>>;

/**
 * 自分のプロフィールを保存する
 *
 * `input.updatedAt` が無ければ新規、あれば同時編集を検知しながら更新する
 */
export type SaveProfile = (
  owner: ProfileOwner,
  input: ProfileSaveInput,
) => Promise<Result<ProfileDto, ProfileWriteError>>;

/**
 * 設定画面がプロフィールを読み書きする port
 *
 * 秘書の `ProfilePort` と同じ入れ物を別の面から見たもので、fake では同じインスタンスが両方を満たす
 */
export type ProfileSettingsPort = {
  readProfile: ReadProfile;
  saveProfile: SaveProfile;
};
