import {
  date,
  integer,
  pgTable,
  text,
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
  })
    .defaultNow()
    .notNull(),
};

/**
 * 旅程のヘッダ
 *
 * `end_date` 未設定はヒアリング前を表し、`end_date > start_date` で宿泊を伴うことを表す
 * 合計金額は列に持たず `trip_items` から導出する
 */
export const trips = pgTable("trips", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  originCity: text("origin_city").notNull(),
  destinationCity: text("destination_city").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: text("status").notNull(),
  sourceEventId: text("source_event_id"),
  detectionConfidence: text("detection_confidence"),
  ...timestamps,
});

/**
 * 確定した予約 1 件
 *
 * サービス行は後から編集・無効化できるので、確定時点の名称・単価・送金先を写して持つ
 * これにより履歴の表示はサービス行を参照しなくても成り立つ
 * `service_id` は `category` で参照先テーブルが分かれるため外部キーを張らない
 */
export const tripItems = pgTable("trip_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id").notNull(),
  seq: integer("seq").notNull(),
  category: text("category").notNull(),
  serviceId: uuid("service_id").notNull(),
  nameSnapshot: text("name_snapshot").notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  price: integer("price").notNull(),
  payeeSnapshot: text("payee_snapshot").notNull(),
  startAt: timestamp("start_at", { mode: "date", withTimezone: true }),
  endAt: timestamp("end_at", { mode: "date", withTimezone: true }),
  status: text("status").notNull(),
  bookingRef: text("booking_ref"),
  googleEventId: text("google_event_id"),
  ...timestamps,
});

export type Trip = typeof trips.$inferSelect;
export type TripItem = typeof tripItems.$inferSelect;
