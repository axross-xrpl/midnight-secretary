import { match } from "ts-pattern";
import { z } from "zod";
import { scanEventSchema } from "./calendar-scan-response";
import type { Result } from "./result";
import { map } from "./result";
import type { SchemaError } from "./schema";
import { fromZod } from "./schema";

/**
 * 通貨の最小単位で表した金額
 */
export const moneySchema = z.object({
  amount: z.number(),
  currency: z.enum(["MST", "NIGHT"]),
});

/**
 * ユーザから秘書への支払いの委任
 */
export const mandateSchema = z.object({
  id: z.string(),
  cap: moneySchema,
  spent: moneySchema,
  expiresAt: z.string(),
  purpose: z.string(),
  commitment: z.string(),
});

/**
 * 承認と同時に行われたトークンの移動
 */
export const settlementSchema = z.object({
  kind: z.literal("tokenTransfer"),
  transactionId: z.string(),
  recipient: z.string(),
});

/**
 * 支払い 1 件が mandate のもとで承認された証拠
 */
export const authorizationSchema = z.object({
  mandateId: z.string(),
  paymentRef: z.string(),
  amount: moneySchema,
  authorizedAt: z.string(),
  publicHash: z.string(),
  settlement: settlementSchema,
});

/**
 * 予約可能な交通区間 1 件
 */
export const transportOfferSchema = z.object({
  id: z.string(),
  mode: z.enum(["rail", "air"]),
  vendor: z.string(),
  payee: z.string(),
  origin: z.string(),
  destination: z.string(),
  departAt: z.string(),
  arriveAt: z.string(),
  price: moneySchema,
});

/**
 * 予約可能な宿泊 1 件
 */
export const lodgingOfferSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  payee: z.string(),
  name: z.string(),
  city: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  price: moneySchema,
});

/**
 * プランナーが予定から読み取った内容
 */
export const tripIntentSchema = z.object({
  destination: z.string(),
  departOn: z.string(),
  returnOn: z.string(),
  purpose: z.string(),
});

/**
 * 検証済みのプラン
 *
 * 日帰りには宿泊が無い
 */
export const tripPlanSchema = z.object({
  intent: tripIntentSchema,
  outbound: transportOfferSchema,
  inbound: transportOfferSchema,
  lodging: lodgingOfferSchema.optional(),
  total: moneySchema,
  rationale: z.string(),
});

// 4 状態に共通するフィールドで、予定は scan の応答と同じ形なので流用する
const tripBase = {
  id: z.string(),
  event: scanEventSchema,
  plan: tripPlanSchema,
  proposedAt: z.string(),
};

// readonly にしておくと domain の Trip をそのまま props に渡せる (domain の配列は readonly)
const approvedFields = {
  ...tripBase,
  approvedAt: z.string(),
  authorizations: z.array(authorizationSchema).readonly(),
};

const paidFields = { ...approvedFields, paidAt: z.string() };

/**
 * 出張の 4 状態
 *
 * status で分かれ、後の状態は前の状態のフィールドをすべて持つ
 */
export const tripSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("proposed"), ...tripBase }),

  z.object({ status: z.literal("approved"), ...approvedFields }),

  z.object({ status: z.literal("paid"), ...paidFields }),

  z.object({
    status: z.literal("written"),
    ...paidFields,
    writtenEventId: z.string(),
    writtenAt: z.string(),
  }),
]);

/**
 * use case の失敗を JSON にしたもの
 *
 * `source` と `kind` で文言を引くのが主な用途なので、それ以外のフィールドは looseObject で通す
 */
export const secretaryErrorJsonSchema = z.object({
  source: z.string(),
  error: z.looseObject({ kind: z.string() }),
});

/**
 * 通貨の最小単位で表した金額
 */
export type MoneyResponse = z.infer<typeof moneySchema>;

/**
 * 支払い 1 件が mandate のもとで承認された証拠
 */
export type AuthorizationResponse = z.infer<typeof authorizationSchema>;

/**
 * 予約可能な交通区間 1 件
 */
export type TransportOfferResponse = z.infer<typeof transportOfferSchema>;

/**
 * 予約可能な宿泊 1 件
 */
export type LodgingOfferResponse = z.infer<typeof lodgingOfferSchema>;

/**
 * 検証済みのプラン
 */
export type TripPlanResponse = z.infer<typeof tripPlanSchema>;

/**
 * ユーザから秘書への支払いの委任
 */
export type MandateResponse = z.infer<typeof mandateSchema>;

/**
 * 出張 1 件
 */
export type TripResponse = z.infer<typeof tripSchema>;

/**
 * use case の失敗を JSON にしたもの
 */
export type SecretaryErrorJson = z.infer<typeof secretaryErrorJsonSchema>;

/**
 * 失敗の応答をクライアントが扱う形
 *
 * `unknown` は封筒として読めなかったとき (ネットワーク層で壊れた応答など)
 */
export type SecretaryFailure =
  | { code: "unauthorized" }
  | { code: "invalid_request"; issues: unknown }
  | { code: "secretary"; error: SecretaryErrorJson }
  | { code: "unknown" };

const mandateEnvelopeSchema = z.object({ data: mandateSchema });

const tripEnvelopeSchema = z.object({ data: tripSchema });

const failureBodySchema = z.looseObject({ code: z.string() });

const failureEnvelopeSchema = z.object({ error: failureBodySchema });

type FailureBody = z.infer<typeof failureBodySchema>;

// detail が読めない secretary の失敗は、封筒として壊れているのと同じに扱う
const secretaryFailureOf = (body: FailureBody): SecretaryFailure => {
  const detail = secretaryErrorJsonSchema.safeParse(body.detail);

  if (!detail.success) {
    return { code: "unknown" };
  }

  return { code: "secretary", error: detail.data };
};

/**
 * `POST /api/secretary/mandate` の応答から mandate を取り出す
 */
export const parseMandateResponse = (
  payload: unknown,
): Result<MandateResponse, SchemaError> => {
  return map(
    fromZod(mandateEnvelopeSchema.safeParse(payload)),
    (envelope) => envelope.data,
  );
};

/**
 * 出張を返す Route Handler の応答から出張を取り出す
 */
export const parseTripResponse = (
  payload: unknown,
): Result<TripResponse, SchemaError> => {
  return map(
    fromZod(tripEnvelopeSchema.safeParse(payload)),
    (envelope) => envelope.data,
  );
};

/**
 * 失敗応答の JSON をクライアントが扱う形にする
 *
 * 形が合わない応答と知らない code は unknown にする total function
 */
export const parseSecretaryFailure = (payload: unknown): SecretaryFailure => {
  const parsed = failureEnvelopeSchema.safeParse(payload);

  if (!parsed.success) {
    return { code: "unknown" };
  }

  const body = parsed.data.error;

  return match(body.code)
    .returnType<SecretaryFailure>()
    .with("unauthorized", () => ({ code: "unauthorized" }))
    .with("invalid_request", () => ({
      code: "invalid_request",
      issues: body.issues,
    }))
    .with("secretary", () => secretaryFailureOf(body))
    .otherwise(() => ({ code: "unknown" }));
};

/**
 * `plan.overBudget` の detail のうち画面が出す金額
 */
export type PlanOverBudgetDetail = {
  budget: MoneyResponse;
  total: MoneyResponse;
};

/**
 * `mandate.overBudget` の detail のうち画面が出す金額
 */
export type MandateOverBudgetDetail = {
  cap: MoneyResponse;
  spent: MoneyResponse;
  requested: MoneyResponse;
};

const planOverBudgetSchema = z.object({
  source: z.literal("plan"),
  error: z.object({
    kind: z.literal("overBudget"),
    budget: moneySchema,
    total: moneySchema,
  }),
});

const mandateOverBudgetSchema = z.object({
  source: z.literal("mandate"),
  error: z.object({
    kind: z.literal("overBudget"),
    cap: moneySchema,
    spent: moneySchema,
    requested: moneySchema,
  }),
});

/**
 * `plan.overBudget` の失敗から金額を取り出す
 *
 * `source` / `kind` が違うか、金額の形が合わなければスキーマの失敗
 */
export const parsePlanOverBudget = (
  error: SecretaryErrorJson,
): Result<PlanOverBudgetDetail, SchemaError> => {
  return map(fromZod(planOverBudgetSchema.safeParse(error)), (parsed) => ({
    budget: parsed.error.budget,
    total: parsed.error.total,
  }));
};

/**
 * `mandate.overBudget` の失敗から金額を取り出す
 *
 * `source` / `kind` が違うか、金額の形が合わなければスキーマの失敗
 */
export const parseMandateOverBudget = (
  error: SecretaryErrorJson,
): Result<MandateOverBudgetDetail, SchemaError> => {
  return map(fromZod(mandateOverBudgetSchema.safeParse(error)), (parsed) => ({
    cap: parsed.error.cap,
    spent: parsed.error.spent,
    requested: parsed.error.requested,
  }));
};
