import "server-only";

import { match } from "ts-pattern";
import type { ServiceWriteError } from "@/features/services/settings-port";
import {
  conflictResponse,
  databaseConstraintResponse,
  databaseWriteErrorResponse,
  duplicateCodeResponse,
  immutableCategoryResponse,
  notFoundResponse,
} from "@/lib/api-response";

/**
 * サービスの書き込みの失敗を応答にする
 *
 * `unavailable` は分類できない DB の失敗なので、原因をログに出して 500 にする
 */
export const serviceWriteErrorResponse = (
  error: ServiceWriteError,
): Response => {
  return match<ServiceWriteError, Response>(error)
    .with({ kind: "notFound" }, () => notFoundResponse())
    .with({ kind: "conflict" }, () => conflictResponse())
    .with({ kind: "duplicateCode" }, () => duplicateCodeResponse())
    .with({ kind: "immutableCategory" }, () => immutableCategoryResponse())
    .with({ kind: "constraintViolation" }, () => databaseConstraintResponse())
    .with({ kind: "unavailable" }, ({ cause }) =>
      databaseWriteErrorResponse(cause),
    )
    .exhaustive();
};
