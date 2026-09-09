import {
  boolean,
  integer,
  numeric,
  pgTable,
  pgView,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
};

export const transportServices = pgTable("transport_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  mode: text("mode").notNull(),
  fromCity: text("from_city").notNull(),
  toCity: text("to_city").notNull(),
  fromSpot: text("from_spot").notNull(),
  toSpot: text("to_spot").notNull(),
  departTime: time("depart_time"),
  arriveTime: time("arrive_time"),
  durationMin: integer("duration_min").notNull(),
  priceJpyc: integer("price_jpyc").notNull(),
  originAccessMin: integer("origin_access_min").notNull(),
  boardingBufferMin: integer("boarding_buffer_min").notNull(),
  arrivalBufferMin: integer("arrival_buffer_min"),
  destinationAccessMin: integer("destination_access_min").notNull(),
  accessFareJpyc: integer("access_fare_jpyc"),
  seatClass: text("seat_class"),
  walletAddress: text("wallet_address").notNull(),
  active: boolean("active").notNull(),
  ...timestamps,
});

export const placeServices = pgTable("place_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),
  nearestStation: text("nearest_station").notNull(),
  stationAccessMin: integer("station_access_min").notNull(),
  priceJpyc: integer("price_jpyc").notNull(),
  requiredVerifications: text("required_verifications").array().notNull(),
  itemName: text("item_name"),
  genre: text("genre"),
  openFrom: time("open_from"),
  openTo: time("open_to"),
  checkinFrom: time("checkin_from"),
  checkoutBy: time("checkout_by"),
  rating: numeric("rating", { mode: "number", precision: 2, scale: 1 }),
  breakfastIncluded: boolean("breakfast_included"),
  hasAlcohol: boolean("has_alcohol"),
  seats: text("seats"),
  ageLimit: integer("age_limit"),
  walletAddress: text("wallet_address").notNull(),
  active: boolean("active").notNull(),
  ...timestamps,
});

export const serviceCatalog = pgView("service_catalog", {
  id: uuid("id").notNull(),
  category: text("category").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  priceJpyc: integer("price_jpyc").notNull(),
  location: text("location").notNull(),
  walletAddress: text("wallet_address").notNull(),
  active: boolean("active").notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
}).existing();

export type TransportService = typeof transportServices.$inferSelect;
export type PlaceService = typeof placeServices.$inferSelect;
