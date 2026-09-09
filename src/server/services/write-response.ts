import "server-only";

import {
  conflictResponse,
  databaseConstraintResponse,
  duplicateCodeResponse,
  immutableCategoryResponse,
  notFoundResponse,
} from "@/lib/api-response";
import type { ServiceWriteError } from "./write-services";

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
  }
}
