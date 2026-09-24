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
 * 支払い 1 件の公開範囲
 */
export const settlementVisibilitySchema = z.enum(["public", "private"]);

/**
 * 承認のときに選んだ、候補ごとの支払いの公開範囲
 *
 * `lodging` は計画に宿があるとき、`dining` と `leisure` は計画にその場があるときだけ載る
 */
export const paymentVisibilitySchema = z.object({
  outbound: settlementVisibilitySchema,
  inbound: settlementVisibilitySchema,
  lodging: settlementVisibilitySchema.optional(),
  dining: settlementVisibilitySchema.optional(),
  leisure: settlementVisibilitySchema.optional(),
});

/**
 * 承認と同時に行われたトークンの移動
 *
 * `tokenTransfer` は unshielded、`shieldedTransfer` は shielded の送金
 */
export const settlementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tokenTransfer"),
    transactionId: z.string(),
    recipient: z.string(),
  }),

  z.object({
    kind: z.literal("shieldedTransfer"),
    transactionId: z.string(),
    recipient: z.string(),
  }),
]);

/**
 * 預かりの状態 (予約時に預かり、受取の確認で受取先へ解放する)
 */
export const escrowSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("held"), heldAt: z.string() }),

  z.object({
    status: z.literal("released"),
    heldAt: z.string(),
    releasedAt: z.string(),
    releaseRef: z.string(),
  }),
]);

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
  escrow: escrowSchema,
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
 * 現地のサービス 1 件 (飲食・レジャー)
 *
 * `ageLimit` は `requiredVerifications` に `age` を含むときだけ入る
 */
export const placeOfferSchema = z.object({
  id: z.string(),
  kind: z.enum(["restaurant", "leisure"]),
  payee: z.string(),
  name: z.string(),
  city: z.string(),
  genre: z.string().optional(),
  price: moneySchema,
  requiredVerifications: z
    .array(z.enum(["age", "nationality", "residence"]))
    .readonly(),
  ageLimit: z.number().optional(),
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
 * 日帰りには宿泊が無く、飲食とレジャーは選ばれたときだけある
 */
export const tripPlanSchema = z.object({
  intent: tripIntentSchema,
  outbound: transportOfferSchema,
  inbound: transportOfferSchema,
  lodging: lodgingOfferSchema.optional(),
  dining: placeOfferSchema.optional(),
  leisure: placeOfferSchema.optional(),
  total: moneySchema,
  rationale: z.string(),
});

/**
 * 成人の証明 (承認のときに通ったもの)
 *
 * `cutoffDate` は出発日の `ageLimit` 年前で、生年月日は載らない
 */
export const ageProofSchema = z.object({
  identity: z.string(),
  cutoffDate: z.string(),
  proofRef: z.string(),
  provedAt: z.string(),
});

/**
 * 証明書がどこに載っているか
 *
 * `memory` は Fake のインメモリで発行時刻を持ち、`midnight` は Midnight のコントラクトで生年月日のコミットメントとアドレスを持つ
 */
export const ageCredentialOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("memory"), registeredAt: z.string() }),

  z.object({
    kind: z.literal("midnight"),
    dobCommitment: z.string(),
    contractAddress: z.string(),
  }),
]);

/**
 * 発行済みの年齢確認証明書
 *
 * 公開されるのは commitment の鍵 (`identity`) と載っている場所の情報だけで、生年月日は載らない
 */
export const ageRegistrationSchema = z.object({
  identity: z.string(),
  origin: ageCredentialOriginSchema,
});

/**
 * 秘書が計画を作り直した記録
 *
 * いまは年齢確認が通らなかったときだけ
 * `previous` は作り直す前の提案と、承認のときに選んでいた公開範囲
 */
export const planRevisionSchema = z.object({
  reason: z.object({
    kind: z.literal("ageNotVerified"),
    ageLimit: z.number(),
    cutoffDate: z.string(),
  }),
  previous: z.object({
    plan: tripPlanSchema,
    proposedAt: z.string(),
    visibility: paymentVisibilitySchema,
  }),
  revisedAt: z.string(),
});

/**
 * 年齢の証明が通らなかった記録
 *
 * 提案済みの出張にだけ載り、`visibility` は承認のときに選んでいた公開範囲
 */
export const failedAgeCheckSchema = z.object({
  ageLimit: z.number(),
  cutoffDate: z.string(),
  visibility: paymentVisibilitySchema,
  checkedAt: z.string(),
});

/**
 * 確定旅程を DB に写すのに失敗したこと
 *
 * 書き戻しの応答にだけ載り、画面は補足の 1 行を出すのに使う (`kind` 以外のフィールドは looseObject で通す)
 */
export const confirmedStoreErrorSchema = z.looseObject({ kind: z.string() });

// 4 状態に共通するフィールドで、予定は scan の応答と同じ形なので流用する
// 作り直した提案の記録は承認以降も引き継ぐので、4 状態すべてが持ちうる
const tripBase = {
  id: z.string(),
  event: scanEventSchema,
  plan: tripPlanSchema,
  proposedAt: z.string(),
  revision: planRevisionSchema.optional(),
};

// 証明が通らなかった記録は提案済みにだけ載る (承認できるのは通った trip だけ)
const proposedFields = {
  ...tripBase,
  failedAgeCheck: failedAgeCheckSchema.optional(),
};

// readonly にしておくと domain の Trip をそのまま props に渡せる (domain の配列は readonly)
// 成人の証明は計画が年齢制限つきの候補を含むときだけある
const approvedFields = {
  ...tripBase,
  approvedAt: z.string(),
  visibility: paymentVisibilitySchema,
  authorizations: z.array(authorizationSchema).readonly(),
  ageProof: ageProofSchema.optional(),
};

const paidFields = { ...approvedFields, paidAt: z.string() };

/**
 * 出張の 4 状態
 *
 * status で分かれ、後の状態は前の状態のフィールドをすべて持つ
 */
export const tripSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("proposed"), ...proposedFields }),

  z.object({ status: z.literal("approved"), ...approvedFields }),

  z.object({ status: z.literal("paid"), ...paidFields }),

  z.object({
    status: z.literal("written"),
    ...paidFields,
    writtenEventId: z.string(),
    writtenAt: z.string(),
    confirmedStoreError: confirmedStoreErrorSchema.optional(),
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
 * 支払い 1 件の公開範囲
 */
export type SettlementVisibilityResponse = z.infer<
  typeof settlementVisibilitySchema
>;

/**
 * 承認のときに選んだ、候補ごとの支払いの公開範囲
 */
export type PaymentVisibilityResponse = z.infer<typeof paymentVisibilitySchema>;

/**
 * 預かりの状態
 */
export type EscrowResponse = z.infer<typeof escrowSchema>;

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
 * 現地のサービス 1 件 (飲食・レジャー)
 */
export type PlaceOfferResponse = z.infer<typeof placeOfferSchema>;

/**
 * 成人の証明
 */
export type AgeProofResponse = z.infer<typeof ageProofSchema>;

/**
 * 証明書がどこに載っているか
 */
export type AgeCredentialOriginResponse = z.infer<
  typeof ageCredentialOriginSchema
>;

/**
 * 発行済みの年齢確認証明書
 */
export type AgeRegistrationResponse = z.infer<typeof ageRegistrationSchema>;

/**
 * 秘書が計画を作り直した記録
 */
export type PlanRevisionResponse = z.infer<typeof planRevisionSchema>;

/**
 * 年齢の証明が通らなかった記録
 */
export type FailedAgeCheckResponse = z.infer<typeof failedAgeCheckSchema>;

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

// 未発行を表す値が要るので、この封筒だけは JSON の null をそのまま受けて境界で undefined にする
const ageCredentialEnvelopeSchema = z.object({
  data: z.object({ credential: ageRegistrationSchema.nullable() }),
});

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
 * 年齢確認証明書を返す Route Handler の応答から証明書を取り出す
 *
 * 未発行は JSON の null なので、undefined に直して返す
 */
export const parseAgeCredentialResponse = (
  payload: unknown,
): Result<AgeRegistrationResponse | undefined, SchemaError> => {
  return map(
    fromZod(ageCredentialEnvelopeSchema.safeParse(payload)),
    (envelope) => envelope.data.credential ?? undefined,
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
