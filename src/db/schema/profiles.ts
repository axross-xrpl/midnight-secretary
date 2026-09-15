import { date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 利用者の設定
 *
 * NextAuth は JWT 戦略で DB アダプタを持たないので、Google の sub をそのまま主キーにする
 * `birth_date` / `nationality` / `residence_pref` は本人確認の述語の元で、
 * `address` は表示用 (自由入力なので判定には使わない)
 */
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  address: text("address"),
  birthDate: date("birth_date"),
  nationality: text("nationality"),
  residencePref: text("residence_pref"),
  homeCity: text("home_city").notNull(),
  homeSpot: text("home_spot"),
  diningGenres: text("dining_genres").array().notNull(),
  leisureGenres: text("leisure_genres").array().notNull(),
  budget: integer("budget"),
  priority: text("priority"),
  walletAddress: text("wallet_address"),
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
});

export type UserProfile = typeof userProfiles.$inferSelect;
