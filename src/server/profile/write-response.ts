import "server-only";

import { match } from "ts-pattern";
import type { ProfileWriteError } from "@/features/profile/settings-port";
import {
  databaseWriteErrorResponse,
  duplicateEmailResponse,
  profileConflictResponse,
  profileConstraintResponse,
  profileNotFoundResponse,
} from "@/lib/api-response";

/**
 * プロフィールの保存の失敗を応答にする
 *
 * `unavailable` は分類できない DB の失敗なので、原因をログに出して 500 にする
 */
export const profileWriteErrorResponse = (
  error: ProfileWriteError,
): Response => {
  return match<ProfileWriteError, Response>(error)
    .with({ kind: "notFound" }, () => profileNotFoundResponse())
    .with({ kind: "conflict" }, () => profileConflictResponse())
    .with({ kind: "duplicateEmail" }, () => duplicateEmailResponse())
    .with({ kind: "constraintViolation" }, () => profileConstraintResponse())
    .with({ kind: "unavailable" }, ({ cause }) =>
      databaseWriteErrorResponse(cause),
    )
    .exhaustive();
};
