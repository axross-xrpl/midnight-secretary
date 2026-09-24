import "server-only";

import { mustParse, parseUserId } from "@/domain/identifiers.parse";
import type { ProfileSettingsPort, ProfileWriteError } from "@/domain/profile";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import type { Result } from "@/lib/result";
import type { SessionUser } from "@/lib/session-user";

export type { ProfileWriteError } from "@/domain/profile";

/**
 * 自分のプロフィールを保存する
 *
 * `updatedAt` が無いときは未登録として作り、あるときは同時編集を検知しつつ書き換える
 * どちらも `user_id` はセッション由来なので、他人の行には触れない
 */
export const saveProfile = async (
  user: SessionUser,
  input: ProfileSaveInput,
  profile: ProfileSettingsPort,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  return profile.saveProfile(
    { userId: mustParse(parseUserId(user.userId)), email: user.email },
    input,
  );
};
