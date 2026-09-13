import { z } from "zod";

export const serviceKinds = ["hotel", "restaurant", "leisure"] as const;

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
    filters: filtersSchema.default({ city: "大阪" }),
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
    filters: filtersSchema.default({ city: "大阪" }),
    candidateIds: z
      .array(z.string().regex(/^[a-z0-9-]{1,64}$/))
      .min(1)
      .max(60),
    messages: z.array(chatMessageSchema).min(1).max(10),
  })
  .strict();

const pickSchema = z
  .object({
    id: z.string().min(1).max(64),
    reason: z.string().min(1).max(300),
  })
  .strict();

/**
 * Gemini に返させる形
 *
 * 種別ごとに最大3件まで選ばせ、`message` で3種別をまとめた結論を書かせる
 */
export const geminiProposalSchema = z
  .object({
    hotel: z.array(pickSchema).max(3),
    restaurant: z.array(pickSchema).max(3),
    leisure: z.array(pickSchema).max(3),
    message: z.string().min(1).max(800),
  })
  .strict();

export type ProposalRequest = z.infer<typeof proposalRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type GeminiProposal = z.infer<typeof geminiProposalSchema>;

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
