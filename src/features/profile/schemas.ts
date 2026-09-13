import { z } from "zod";
import {
  MAX_GENRE_LENGTH,
  MAX_GENRES,
  MIN_BIRTH_DATE,
  priorities,
  residenceOptions,
} from "./constants";

const optionalText = (maximumLength: number) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().min(1).max(maximumLength).nullable().default(null),
  );

const genres = z
  .array(z.string().trim().min(1).max(MAX_GENRE_LENGTH))
  .max(MAX_GENRES)
  .refine((values) => new Set(values).size === values.length)
  .default([]);

/**
 * 生年月日
 *
 * 未来日と 1900 年より前を弾く。年齢確認 (`age`) の述語の元になるので、
 * 明らかに誤った値を保存させない
 */
const birthDate = z.preprocess(
  (value) => (value === "" ? null : value),
  z.iso
    .date()
    .refine((value) => value >= MIN_BIRTH_DATE)
    .refine((value) => value <= new Date().toISOString().slice(0, 10))
    .nullable()
    .default(null),
);

const budget = z.preprocess(
  (value) => (value === "" || Number.isNaN(value) ? null : value),
  z.number().int().min(0).max(100_000_000).nullable().default(null),
);

/**
 * プロフィール保存の入力
 *
 * `userId` / `email` はサーバがセッションから決めるので受け取らない
 * `walletAddress` は SCR-04c の担当、`nationality` は MVP では画面を持たないため、どちらも含めない
 * `updatedAt` は取得時の値。未登録のときだけ省略できる (§6.4 の競合検知)
 */
export const profileSaveSchema = z
  .object({
    fullName: optionalText(80),
    address: optionalText(200),
    birthDate,
    residencePref: z.preprocess(
      (value) => (value === "" ? null : value),
      z.enum(residenceOptions).nullable().default(null),
    ),
    homeCity: z.string().trim().min(1).max(80),
    homeSpot: optionalText(120),
    diningGenres: genres,
    leisureGenres: genres,
    budgetJpyc: budget,
    priority: z.preprocess(
      (value) => (value === "" ? null : value),
      z.enum(priorities).nullable().default(null),
    ),
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type ProfileSaveInput = z.infer<typeof profileSaveSchema>;

/**
 * 画面が扱うプロフィール
 *
 * `user_profiles` の行のうち本画面が持つ列だけを写したもの
 * ブラウザ側の境界なので、応答はこのスキーマで確かめてから使う
 */
export const profileSchema = z.object({
  email: z.string(),
  fullName: z.string().nullable(),
  address: z.string().nullable(),
  birthDate: z.string().nullable(),
  residencePref: z.string().nullable(),
  homeCity: z.string(),
  homeSpot: z.string().nullable(),
  diningGenres: z.array(z.string()),
  leisureGenres: z.array(z.string()),
  budgetJpyc: z.number().int().nullable(),
  priority: z.enum(priorities).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const profileResponseSchema = z.object({ data: profileSchema });

export type ProfileDto = z.infer<typeof profileSchema>;

/** 保存できる項目の名前。エラー文言の引き当てに使う */
export const profileFields = [
  "fullName",
  "address",
  "birthDate",
  "residencePref",
  "homeCity",
  "homeSpot",
  "diningGenres",
  "leisureGenres",
  "budgetJpyc",
  "priority",
] as const;

export type ProfileField = (typeof profileFields)[number];

export const isProfileField = (value: string): value is ProfileField => {
  return (profileFields as readonly string[]).includes(value);
};
