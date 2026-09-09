import { z } from "zod";
import {
  placeKinds,
  serviceCategories,
  transportModes,
  verificationKinds,
} from "./constants";

const requiredText = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength);

const optionalText = (maximumLength: number) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().min(1).max(maximumLength).nullable().optional(),
  );

const optionalTime = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    .transform((value) => value.slice(0, 5))
    .nullable()
    .optional(),
);

const nonNegativeInteger = z.number().int().min(0);
const accessMinutes = z.number().int().min(0).max(240);

export const transportServiceCreateSchema = z
  .object({
    mode: z.enum(transportModes),
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{2,40}$/),
    name: requiredText(80),
    fromCity: requiredText(80),
    toCity: requiredText(80),
    fromSpot: requiredText(120),
    toSpot: requiredText(120),
    departTime: optionalTime,
    arriveTime: optionalTime,
    durationMin: z.number().int().min(1).max(1440),
    priceJpyc: nonNegativeInteger,
    originAccessMin: accessMinutes,
    boardingBufferMin: accessMinutes,
    arrivalBufferMin: accessMinutes.nullable().optional(),
    destinationAccessMin: accessMinutes,
    accessFareJpyc: nonNegativeInteger.nullable().optional(),
    seatClass: optionalText(80),
    walletAddress: requiredText(200).pipe(z.string().min(8)),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fromCity === value.toCity) {
      context.addIssue({
        code: "custom",
        message: "Departure and arrival cities must be different",
        path: ["toCity"],
      });
    }
  });

export const transportServiceUpdateSchema =
  transportServiceCreateSchema.safeExtend({
    active: z.boolean(),
    updatedAt: z.string().datetime({ offset: true }),
  });

const placeServiceFields = z
  .object({
    kind: z.enum(placeKinds),
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{2,40}$/),
    name: requiredText(80),
    city: requiredText(80),
    address: requiredText(200),
    nearestStation: requiredText(120),
    stationAccessMin: accessMinutes,
    priceJpyc: nonNegativeInteger,
    requiredVerifications: z
      .array(z.enum(verificationKinds))
      .max(verificationKinds.length)
      .refine((values) => new Set(values).size === values.length)
      .default([]),
    itemName: optionalText(120),
    genre: optionalText(80),
    openFrom: optionalTime,
    openTo: optionalTime,
    checkinFrom: optionalTime,
    checkoutBy: optionalTime,
    rating: z.number().min(0).max(5).multipleOf(0.1).nullable().optional(),
    breakfastIncluded: z.boolean().nullable().optional(),
    hasAlcohol: z.boolean().nullable().optional(),
    seats: optionalText(80),
    ageLimit: z.number().int().min(0).max(120).nullable().optional(),
    walletAddress: requiredText(200).pipe(z.string().min(8)),
    active: z.boolean().default(true),
  })
  .strict();

export const placeServiceCreateSchema = placeServiceFields.superRefine(
  (value, context) => {
    const rejects = (field: keyof typeof value) => {
      if (value[field] !== null && value[field] !== undefined) {
        context.addIssue({
          code: "custom",
          message: `This field is not available for ${value.kind}`,
          path: [field],
        });
      }
    };

    if (value.kind !== "hotel" && !value.genre) {
      context.addIssue({
        code: "custom",
        message: "Genre is required",
        path: ["genre"],
      });
    }

    if (value.kind === "hotel") {
      for (const field of [
        "genre",
        "openFrom",
        "openTo",
        "hasAlcohol",
        "seats",
      ] as const) {
        rejects(field);
      }
    }

    if (value.kind === "restaurant") {
      if (!value.itemName) {
        context.addIssue({
          code: "custom",
          message: "Item name is required",
          path: ["itemName"],
        });
      }
      if (value.hasAlcohol === null || value.hasAlcohol === undefined) {
        context.addIssue({
          code: "custom",
          message: "Alcohol availability is required",
          path: ["hasAlcohol"],
        });
      }
      for (const field of [
        "checkinFrom",
        "checkoutBy",
        "rating",
        "breakfastIncluded",
      ] as const) {
        rejects(field);
      }
    }

    if (value.kind === "leisure") {
      for (const field of [
        "itemName",
        "checkinFrom",
        "checkoutBy",
        "rating",
        "breakfastIncluded",
        "hasAlcohol",
        "seats",
      ] as const) {
        rejects(field);
      }
    }

    if (value.openFrom && value.openTo && value.openFrom >= value.openTo) {
      context.addIssue({
        code: "custom",
        message: "End time must be later than start time",
        path: ["openTo"],
      });
    }

    const requiresAge = value.requiredVerifications.includes("age");
    if (
      requiresAge !== (value.ageLimit !== null && value.ageLimit !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Age verification and age limit must be specified together",
        path: ["ageLimit"],
      });
    }
  },
);

export const placeServiceUpdateSchema = placeServiceCreateSchema.safeExtend({
  active: z.boolean(),
  requiredVerifications: z
    .array(z.enum(verificationKinds))
    .max(verificationKinds.length)
    .refine((values) => new Set(values).size === values.length),
  updatedAt: z.string().datetime({ offset: true }),
});

export const serviceDisableSchema = z
  .object({ updatedAt: z.string().datetime({ offset: true }) })
  .strict();

export const serviceListItemSchema = z.object({
  id: z.uuid(),
  category: z.enum(serviceCategories),
  code: z.string(),
  name: z.string(),
  priceJpyc: z.number().int(),
  /** 交通は区間、場所系は都市 */
  location: z.string(),
  /** 場所系の最寄り駅。交通は null */
  station: z.string().nullable(),
  /** 最寄り駅からの時間。交通は null */
  stationAccessMin: z.number().int().nullable(),
  /** 場所系が要求する本人確認。交通は常に空 */
  requiredVerifications: z.array(z.enum(verificationKinds)),
  ageLimit: z.number().int().nullable(),
  active: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const serviceListResponseSchema = z.object({
  data: z.array(serviceListItemSchema),
});

/**
 * 詳細の応答
 *
 * ブラウザ側の境界なので、Route Handler が返す行をスキーマで確かめてから使う
 * time 型は "HH:MM:SS" の文字列で来るため、表示側で時分に切る
 */
const timeText = z.string().nullable();

export const transportServiceDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  mode: z.enum(transportModes),
  fromCity: z.string(),
  toCity: z.string(),
  fromSpot: z.string(),
  toSpot: z.string(),
  departTime: timeText,
  arriveTime: timeText,
  durationMin: z.number().int(),
  priceJpyc: z.number().int(),
  originAccessMin: z.number().int(),
  boardingBufferMin: z.number().int(),
  arrivalBufferMin: z.number().int().nullable(),
  destinationAccessMin: z.number().int(),
  accessFareJpyc: z.number().int().nullable(),
  seatClass: z.string().nullable(),
  walletAddress: z.string(),
  active: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const placeServiceDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(placeKinds),
  city: z.string(),
  address: z.string(),
  nearestStation: z.string(),
  stationAccessMin: z.number().int(),
  priceJpyc: z.number().int(),
  requiredVerifications: z.array(z.enum(verificationKinds)),
  itemName: z.string().nullable(),
  genre: z.string().nullable(),
  openFrom: timeText,
  openTo: timeText,
  checkinFrom: timeText,
  checkoutBy: timeText,
  rating: z.number().nullable(),
  breakfastIncluded: z.boolean().nullable(),
  hasAlcohol: z.boolean().nullable(),
  seats: z.string().nullable(),
  ageLimit: z.number().int().nullable(),
  walletAddress: z.string(),
  active: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const transportServiceDetailResponseSchema = z.object({
  data: transportServiceDetailSchema,
});

export const placeServiceDetailResponseSchema = z.object({
  data: placeServiceDetailSchema,
});

export type TransportServiceCreateInput = z.infer<
  typeof transportServiceCreateSchema
>;
export type TransportServiceUpdateInput = z.infer<
  typeof transportServiceUpdateSchema
>;
export type PlaceServiceCreateInput = z.infer<typeof placeServiceCreateSchema>;
export type PlaceServiceUpdateInput = z.infer<typeof placeServiceUpdateSchema>;
export type ServiceListItemDto = z.infer<typeof serviceListItemSchema>;
export type TransportServiceDetailDto = z.infer<
  typeof transportServiceDetailSchema
>;
export type PlaceServiceDetailDto = z.infer<typeof placeServiceDetailSchema>;

/**
 * 種別で参照先が分かれるため、詳細は判別可能なユニオンで扱う
 */
export type ServiceDetailDto =
  | { kind: "transport"; service: TransportServiceDetailDto }
  | { kind: "place"; service: PlaceServiceDetailDto };
