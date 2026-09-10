import { z } from "zod";

const uniqueValues = (values: string[]) =>
  new Set(values).size === values.length;

export const hotelSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,64}$/),
    name: z.string().min(1).max(120),
    name_kana: z.string().min(1).optional(),
    hotel_type: z.enum([
      "hotel",
      "business_hotel",
      "ryokan",
      "hostel",
      "capsule_hotel",
    ]),
    description: z.string().min(50).max(500),
    official_url: z.url().startsWith("https://").optional(),
    image_url: z.url().startsWith("https://").optional(),
    source_url: z.url().startsWith("https://"),
    verified_at: z.iso.date(),
    postal_code: z.string().regex(/^\d{3}-\d{4}$/),
    prefecture: z.literal("大阪府"),
    city: z.literal("大阪市"),
    ward: z.string().min(1),
    address_line: z.string().min(1),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    nearest_station: z.string().min(1),
    station_lines: z.array(z.string().min(1)).refine(uniqueValues).optional(),
    walk_minutes: z.number().int().min(0).max(60),
    access_note: z.string().max(300).optional(),
    price_jpy: z.number().int().positive(),
    price_unit: z.literal("per_room_per_night"),
    occupancy: z.number().int().min(1).max(10),
    tax_included: z.boolean(),
    service_fee_included: z.boolean(),
    meal_condition: z.enum(["none", "breakfast", "half_board", "full_board"]),
    price_note: z.string().max(300).optional(),
    price_checked_at: z.iso.datetime({ offset: true }),
    rating: z.number().min(0),
    rating_scale: z.number().positive(),
    review_count: z.number().int().nonnegative(),
    review_source: z.string().min(1),
    review_source_url: z.url().startsWith("https://"),
    rating_checked_at: z.iso.date(),
    reputation_summary: z.string().max(300).optional(),
    services: z
      .array(
        z.enum([
          "free_wifi",
          "breakfast",
          "room_service",
          "laundry",
          "luggage_storage",
          "airport_shuttle",
          "parking",
          "front_desk_24h",
        ]),
      )
      .min(1)
      .refine(uniqueValues),
    amenities: z
      .array(
        z.enum([
          "private_bathroom",
          "air_conditioning",
          "refrigerator",
          "desk",
          "public_bath",
          "sauna",
          "barrier_free",
        ]),
      )
      .min(1)
      .refine(uniqueValues),
    features: z
      .array(
        z.enum([
          "near_station",
          "city_view",
          "family_friendly",
          "business_friendly",
          "long_stay",
          "local_character",
          "quiet_area",
        ]),
      )
      .min(1)
      .refine(uniqueValues),
    supported_languages: z
      .array(z.string().min(2))
      .refine(uniqueValues)
      .optional(),
    check_in_from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    check_in_until: z
      .string()
      .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/)
      .optional(),
    check_out_until: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine((hotel) => hotel.rating <= hotel.rating_scale, {
    message: "rating must not exceed rating_scale",
    path: ["rating"],
  });

export const catalogSchema = z
  .object({
    schema_version: z.literal("1.0"),
    updated_at: z.iso.datetime({ offset: true }),
    currency: z.literal("JPY"),
    hotels: z.array(hotelSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (catalog) =>
      new Set(catalog.hotels.map((hotel) => hotel.id)).size ===
      catalog.hotels.length,
    {
      message: "hotel ids must be unique",
      path: ["hotels"],
    },
  );

export const filtersSchema = z
  .object({
    city: z.string().trim().min(1).max(20).optional(),
    maxPrice: z.number().int().nonnegative().max(1_000_000).optional(),
  })
  .strict();

export const proposalRequestSchema = z
  .object({
    kind: z.literal("hotel"),
    request: z.string().trim().min(1).max(1000),
    filters: filtersSchema.default({ city: "大阪市" }),
  })
  .strict();

export const chatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1000),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    kind: z.literal("hotel"),
    filters: filtersSchema.default({ city: "大阪市" }),
    candidateIds: z
      .array(z.string().regex(/^[a-z0-9-]{1,64}$/))
      .min(1)
      .max(20),
    messages: z.array(chatMessageSchema).min(1).max(10),
  })
  .strict();

export const geminiProposalSchema = z
  .object({
    picks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            reason: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(3),
    message: z.string().min(1).max(500),
  })
  .strict();

export type ProposalRequest = z.infer<typeof proposalRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ホテル検索や料金計算の前に、予約日を検証する。
export const hotelBookingRequestSchema = z
  .object({
    hotelId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
  })
  .strict()
  .refine((value) => value.checkOut > value.checkIn, {
    message: "チェックアウト日はチェックイン日より後にしてください",
    path: ["checkOut"],
  });
