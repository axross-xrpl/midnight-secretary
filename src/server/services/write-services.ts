import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  type PlaceService,
  placeServices,
  type TransportService,
  transportServices,
} from "@/db/schema";
import type {
  PlaceServiceCreateInput,
  PlaceServiceUpdateInput,
  TransportServiceCreateInput,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import { err, ok, type Result } from "@/lib/result";

export type ServiceWriteError =
  | { kind: "notFound" }
  | { kind: "conflict" }
  | { kind: "immutableCategory" }
  | { kind: "duplicateCode" }
  | { kind: "constraintViolation" };

type PostgresError = { cause?: unknown; code?: unknown };

function classifyDatabaseError(error: unknown): ServiceWriteError | null {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return null;
    }
    const { cause, code } = current as PostgresError;
    if (code === "23505") {
      return { kind: "duplicateCode" };
    }
    if (code === "23502" || code === "23514" || code === "22P02") {
      return { kind: "constraintViolation" };
    }
    current = cause;
  }
  return null;
}

async function asWriteResult<T>(
  operation: Promise<T>,
): Promise<Result<T, ServiceWriteError>> {
  try {
    return ok(await operation);
  } catch (error) {
    const expectedError = classifyDatabaseError(error);
    if (expectedError) {
      return err(expectedError);
    }
    throw error;
  }
}

function transportValues(input: TransportServiceCreateInput) {
  return {
    code: input.code,
    name: input.name,
    mode: input.mode,
    fromCity: input.fromCity,
    toCity: input.toCity,
    fromSpot: input.fromSpot,
    toSpot: input.toSpot,
    departTime: input.departTime ?? null,
    arriveTime: input.arriveTime ?? null,
    durationMin: input.durationMin,
    price: input.price,
    originAccessMin: input.originAccessMin,
    boardingBufferMin: input.boardingBufferMin,
    arrivalBufferMin: input.arrivalBufferMin ?? null,
    destinationAccessMin: input.destinationAccessMin,
    accessFare: input.accessFare ?? null,
    seatClass: input.seatClass ?? null,
    walletAddress: input.walletAddress,
    active: input.active,
  };
}

function placeValues(input: PlaceServiceCreateInput) {
  return {
    code: input.code,
    kind: input.kind,
    name: input.name,
    city: input.city,
    address: input.address,
    nearestStation: input.nearestStation,
    stationAccessMin: input.stationAccessMin,
    price: input.price,
    requiredVerifications: input.requiredVerifications,
    itemName: input.itemName ?? null,
    genre: input.genre ?? null,
    openFrom: input.openFrom ?? null,
    openTo: input.openTo ?? null,
    checkinFrom: input.checkinFrom ?? null,
    checkoutBy: input.checkoutBy ?? null,
    rating: input.rating ?? null,
    breakfastIncluded: input.breakfastIncluded ?? null,
    hasAlcohol: input.hasAlcohol ?? null,
    seats: input.seats ?? null,
    ageLimit: input.ageLimit ?? null,
    walletAddress: input.walletAddress,
    active: input.active,
  };
}

function millisecondRange(updatedAt: string) {
  const start = new Date(updatedAt);
  return { start, end: new Date(start.getTime() + 1) };
}

export async function createTransportService(
  input: TransportServiceCreateInput,
): Promise<Result<TransportService, ServiceWriteError>> {
  const now = new Date();
  const operation = getDb()
    .insert(transportServices)
    .values({
      ...transportValues(input),
      updatedAt: now,
    })
    .returning()
    .then(([service]) => service);

  return asWriteResult(operation);
}

export async function updateTransportService(
  id: string,
  input: TransportServiceUpdateInput,
): Promise<Result<TransportService, ServiceWriteError>> {
  const db = getDb();
  const expectedUpdatedAt = millisecondRange(input.updatedAt);
  const operation = (async () => {
    const [service] = await db
      .update(transportServices)
      .set({ ...transportValues(input), updatedAt: new Date() })
      .where(
        and(
          eq(transportServices.id, id),
          eq(transportServices.mode, input.mode),
          gte(transportServices.updatedAt, expectedUpdatedAt.start),
          lt(transportServices.updatedAt, expectedUpdatedAt.end),
        ),
      )
      .returning();

    if (service) {
      return ok(service);
    }

    const [current] = await db
      .select({ mode: transportServices.mode })
      .from(transportServices)
      .where(eq(transportServices.id, id))
      .limit(1);

    if (!current) {
      return err<ServiceWriteError>({ kind: "notFound" });
    }
    if (current.mode !== input.mode) {
      return err<ServiceWriteError>({ kind: "immutableCategory" });
    }
    return err<ServiceWriteError>({ kind: "conflict" });
  })();

  try {
    return await operation;
  } catch (error) {
    const expectedError = classifyDatabaseError(error);
    if (expectedError) {
      return err(expectedError);
    }
    throw error;
  }
}

export async function disableTransportService(
  id: string,
  updatedAt: string,
): Promise<Result<TransportService, ServiceWriteError>> {
  const db = getDb();
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const [service] = await db
    .update(transportServices)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(transportServices.id, id),
        gte(transportServices.updatedAt, expectedUpdatedAt.start),
        lt(transportServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();

  if (service) {
    return ok(service);
  }

  const [current] = await db
    .select({ id: transportServices.id })
    .from(transportServices)
    .where(eq(transportServices.id, id))
    .limit(1);
  return current ? err({ kind: "conflict" }) : err({ kind: "notFound" });
}

export async function createPlaceService(
  input: PlaceServiceCreateInput,
): Promise<Result<PlaceService, ServiceWriteError>> {
  const now = new Date();
  const operation = getDb()
    .insert(placeServices)
    .values({
      ...placeValues(input),
      updatedAt: now,
    })
    .returning()
    .then(([service]) => service);

  return asWriteResult(operation);
}

export async function updatePlaceService(
  id: string,
  input: PlaceServiceUpdateInput,
): Promise<Result<PlaceService, ServiceWriteError>> {
  const db = getDb();
  const expectedUpdatedAt = millisecondRange(input.updatedAt);
  try {
    const [service] = await db
      .update(placeServices)
      .set({ ...placeValues(input), updatedAt: new Date() })
      .where(
        and(
          eq(placeServices.id, id),
          eq(placeServices.kind, input.kind),
          gte(placeServices.updatedAt, expectedUpdatedAt.start),
          lt(placeServices.updatedAt, expectedUpdatedAt.end),
        ),
      )
      .returning();

    if (service) {
      return ok(service);
    }

    const [current] = await db
      .select({ kind: placeServices.kind })
      .from(placeServices)
      .where(eq(placeServices.id, id))
      .limit(1);
    if (!current) {
      return err({ kind: "notFound" });
    }
    if (current.kind !== input.kind) {
      return err({ kind: "immutableCategory" });
    }
    return err({ kind: "conflict" });
  } catch (error) {
    const expectedError = classifyDatabaseError(error);
    if (expectedError) {
      return err(expectedError);
    }
    throw error;
  }
}

export async function disablePlaceService(
  id: string,
  updatedAt: string,
): Promise<Result<PlaceService, ServiceWriteError>> {
  const db = getDb();
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const [service] = await db
    .update(placeServices)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(placeServices.id, id),
        gte(placeServices.updatedAt, expectedUpdatedAt.start),
        lt(placeServices.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();

  if (service) {
    return ok(service);
  }

  const [current] = await db
    .select({ id: placeServices.id })
    .from(placeServices)
    .where(eq(placeServices.id, id))
    .limit(1);
  return current ? err({ kind: "conflict" }) : err({ kind: "notFound" });
}
