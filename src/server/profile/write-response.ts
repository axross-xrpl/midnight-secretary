import "server-only";

import type { ProfileWriteError } from "@/domain/profile";
import {
  databaseWriteErrorResponse,
  duplicateEmailResponse,
  profileConflictResponse,
  profileConstraintResponse,
  profileNotFoundResponse,
} from "@/lib/api-response";

export function profileWriteErrorResponse(error: ProfileWriteError) {
  switch (error.kind) {
    case "notFound":
      return profileNotFoundResponse();
    case "conflict":
      return profileConflictResponse();
    case "duplicateEmail":
      return duplicateEmailResponse();
    case "constraintViolation":
      return profileConstraintResponse();
    case "unavailable":
      return databaseWriteErrorResponse(error.cause);
  }
}
