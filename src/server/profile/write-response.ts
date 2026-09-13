import "server-only";

import {
  duplicateEmailResponse,
  profileConflictResponse,
  profileConstraintResponse,
  profileNotFoundResponse,
} from "@/lib/api-response";
import type { ProfileWriteError } from "./write-profile";

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
  }
}
