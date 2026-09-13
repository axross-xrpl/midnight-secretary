import { NextResponse } from "next/server";

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Authentication is required" } },
    { status: 401 },
  );
}

export function invalidRequestResponse(issues: unknown) {
  return NextResponse.json(
    {
      error: {
        code: "invalid_request",
        message: "The request is invalid",
        issues,
      },
    },
    { status: 422 },
  );
}

export function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "not_found", message: "The service was not found" } },
    { status: 404 },
  );
}

export function conflictResponse() {
  return NextResponse.json(
    {
      error: {
        code: "conflict",
        message: "The service was changed elsewhere; reload and try again",
      },
    },
    { status: 409 },
  );
}

export function duplicateCodeResponse() {
  return NextResponse.json(
    {
      error: {
        code: "duplicate_code",
        message: "The service code is already in use",
        issues: { fieldErrors: { code: ["The code is already in use"] } },
      },
    },
    { status: 422 },
  );
}

export function immutableCategoryResponse() {
  return NextResponse.json(
    {
      error: {
        code: "immutable_category",
        message: "The category cannot be changed after creation",
      },
    },
    { status: 422 },
  );
}

export function databaseConstraintResponse() {
  return NextResponse.json(
    {
      error: {
        code: "constraint_violation",
        message: "The service data violates a database constraint",
      },
    },
    { status: 422 },
  );
}

export function databaseReadErrorResponse(error: unknown) {
  console.error("Database read failed", error);

  return NextResponse.json(
    {
      error: {
        code: "database_read_failed",
        message: "The data could not be loaded",
      },
    },
    { status: 500 },
  );
}

export function databaseWriteErrorResponse(error: unknown) {
  console.error("Database write failed", error);

  return NextResponse.json(
    {
      error: {
        code: "database_write_failed",
        message: "The service could not be saved",
      },
    },
    { status: 500 },
  );
}

export function profileNotFoundResponse() {
  return NextResponse.json(
    { error: { code: "not_found", message: "The profile was not found" } },
    { status: 404 },
  );
}

export function profileConflictResponse() {
  return NextResponse.json(
    {
      error: {
        code: "conflict",
        message: "The profile was changed elsewhere; reload and try again",
      },
    },
    { status: 409 },
  );
}

export function profileConstraintResponse() {
  return NextResponse.json(
    {
      error: {
        code: "constraint_violation",
        message: "The profile data violates a database constraint",
      },
    },
    { status: 422 },
  );
}

export function duplicateEmailResponse() {
  return NextResponse.json(
    {
      error: {
        code: "duplicate_email",
        message: "The email address is already in use",
        issues: { fieldErrors: { email: ["The email is already in use"] } },
      },
    },
    { status: 422 },
  );
}
