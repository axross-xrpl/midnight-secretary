import "server-only";

import type { ServiceWriteError } from "@/domain/catalog";
import {
  conflictResponse,
  databaseConstraintResponse,
  databaseWriteErrorResponse,
  duplicateCodeResponse,
  immutableCategoryResponse,
  notFoundResponse,
} from "@/lib/api-response";

export function serviceWriteErrorResponse(error: ServiceWriteError) {
  switch (error.kind) {
    case "notFound":
      return notFoundResponse();
    case "conflict":
      return conflictResponse();
    case "duplicateCode":
      return duplicateCodeResponse();
    case "immutableCategory":
      return immutableCategoryResponse();
    case "constraintViolation":
      return databaseConstraintResponse();
    case "unavailable":
      return databaseWriteErrorResponse(error.cause);
  }
}
