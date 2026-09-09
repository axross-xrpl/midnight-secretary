import { neon } from "@neondatabase/serverless";
import nextEnv from "@next/env";
import { asc, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  placeServices,
  serviceCatalog,
  transportServices,
} from "../src/db/schema/services.ts";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const client = neon(databaseUrl);
const db = drizzle({
  client,
  schema: { placeServices, serviceCatalog, transportServices },
});

const [serviceTotal] = await db.select({ count: count() }).from(serviceCatalog);
const servicesByCategory = await db
  .select({ category: serviceCatalog.category, count: count() })
  .from(serviceCatalog)
  .groupBy(serviceCatalog.category)
  .orderBy(asc(serviceCatalog.category));
const supportedCities = await db
  .selectDistinct({ city: transportServices.toCity })
  .from(transportServices)
  .where(eq(transportServices.active, true))
  .orderBy(asc(transportServices.toCity));
const [transportSample] = await db
  .select({
    code: transportServices.code,
    name: transportServices.name,
    durationMin: transportServices.durationMin,
    priceJpyc: transportServices.priceJpyc,
    originAccessMin: transportServices.originAccessMin,
    boardingBufferMin: transportServices.boardingBufferMin,
    arrivalBufferMin: transportServices.arrivalBufferMin,
    destinationAccessMin: transportServices.destinationAccessMin,
    accessFareJpyc: transportServices.accessFareJpyc,
  })
  .from(transportServices)
  .where(eq(transportServices.active, true))
  .orderBy(asc(transportServices.code))
  .limit(1);
const [placeSample] = await db
  .select({
    code: placeServices.code,
    kind: placeServices.kind,
    name: placeServices.name,
    city: placeServices.city,
    priceJpyc: placeServices.priceJpyc,
  })
  .from(placeServices)
  .where(eq(placeServices.active, true))
  .orderBy(asc(placeServices.code))
  .limit(1);

const transportDoorToDoor = transportSample
  ? {
      durationMin:
        transportSample.originAccessMin +
        transportSample.boardingBufferMin +
        transportSample.durationMin +
        (transportSample.arrivalBufferMin ?? 0) +
        transportSample.destinationAccessMin,
      priceJpyc:
        transportSample.priceJpyc + (transportSample.accessFareJpyc ?? 0),
    }
  : null;

console.log(
  JSON.stringify(
    {
      connection: "ok",
      serviceTotal: serviceTotal?.count ?? 0,
      servicesByCategory,
      supportedCities: supportedCities.map(({ city }) => city),
      transportSample: transportSample
        ? {
            code: transportSample.code,
            name: transportSample.name,
            doorToDoor: transportDoorToDoor,
          }
        : null,
      placeSample,
    },
    null,
    2,
  ),
);
