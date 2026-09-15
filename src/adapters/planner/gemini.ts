import { z } from "zod";
import type { CalendarEvent } from "@/domain/calendar";
import type { OfferSet } from "@/domain/catalog";
import type { OfferId } from "@/domain/identifiers";
import type { PlanChoice, TripIntent } from "@/domain/plan";
import type {
  ChoiceContext,
  InterpretContext,
  PlannerError,
  PlannerPort,
} from "@/domain/planner";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { fromZod } from "@/lib/schema";
import { datesOf } from "./event-dates";
import {
  CHOICE_JSON_SCHEMA,
  choicePrompt,
  INTERPRET_JSON_SCHEMA,
  interpretPrompt,
} from "./gemini-prompts";

/**
 * LLM に JSON を 1 回生成させる
 *
 * 本番は `@google/genai` (`gemini-client.ts`)、テストは決め打ちの JSON を返す Stub
 * 返る JSON の形は呼び出し側が zod で確かめる
 */
export type GenerateJson = (
  prompt: string,
  responseJsonSchema: Readonly<Record<string, unknown>>,
) => Promise<Result<unknown, PlannerError>>;

/**
 * Gemini の planner が外の世界に求めるもの
 */
export type GeminiPlannerDeps = {
  generate: GenerateJson;
};

// Gemini の答えは JSON schema で縛った上で、境界としてもう一度 zod で確かめる
// 出張でないときは purpose が空でよいので、長さの下限は付けない
const interpretResultSchema = z
  .object({
    isTrip: z.boolean(),
    destination: z.string().nullable(),
    purpose: z.string().max(200),
    reason: z.string().max(300),
  })
  .strict();

const choiceResultSchema = z
  .object({
    outboundId: z.string().min(1),
    inboundId: z.string().min(1),
    lodgingId: z.string().min(1).nullable(),
    diningId: z.string().min(1).nullable(),
    leisureId: z.string().min(1).nullable(),
    rationale: z.string().min(1).max(300),
  })
  .strict();

const notATrip = (reason: string): PlannerError => {
  return { kind: "notATrip", reason };
};

const unknownOffer = (raw: string): PlannerError => {
  return { kind: "noViableChoice", reason: `unknown offer id: ${raw}` };
};

// 返ってきた id を候補の集合と突き合わせ、集合の中の brand 付きの id を返す
const offerIdIn = (
  offers: readonly { id: OfferId }[],
  raw: string,
): OfferId | undefined => {
  return offers.find((offer) => offer.id === raw)?.id;
};

// 選ばなかったことを表す null は境界でここだけ受け取り、選んだときは候補の中の id に写す
// 宿、飲食、レジャーはどれも任意なので同じ扱いにする
const optionalOfferIdIn = (
  offers: readonly { id: OfferId }[],
  raw: string | null,
): Result<OfferId | undefined, PlannerError> => {
  if (raw === null) {
    return ok(undefined);
  }

  const offerId = offerIdIn(offers, raw);

  if (offerId === undefined) {
    return err(unknownOffer(raw));
  }

  return ok(offerId);
};

const interpret = async (
  event: CalendarEvent,
  context: InterpretContext,
  deps: GeminiPlannerDeps,
): Promise<Result<TripIntent, PlannerError>> => {
  const generated = await deps.generate(
    interpretPrompt(event, context),
    INTERPRET_JSON_SCHEMA,
  );

  if (!generated.ok) {
    return generated;
  }

  const answer = fromZod(interpretResultSchema.safeParse(generated.value));

  if (!answer.ok) {
    return answer;
  }

  if (!answer.value.isTrip) {
    return err(notATrip(answer.value.reason));
  }

  const destination =
    answer.value.destination === null ? undefined : answer.value.destination;

  if (
    destination === undefined ||
    !context.knownDestinations.includes(destination)
  ) {
    return err(
      notATrip(`destination is not in the catalog: ${destination ?? "(none)"}`),
    );
  }

  return ok({
    destination,
    ...datesOf(event.when),
    // 用件が空なら予定の題名で代える (Fake と同じ)
    purpose: answer.value.purpose === "" ? event.title : answer.value.purpose,
  });
};

const choose = async (
  intent: TripIntent,
  offers: OfferSet,
  context: ChoiceContext,
  deps: GeminiPlannerDeps,
): Promise<Result<PlanChoice, PlannerError>> => {
  const generated = await deps.generate(
    choicePrompt(intent, offers, context),
    CHOICE_JSON_SCHEMA,
  );

  if (!generated.ok) {
    return generated;
  }

  const answer = fromZod(choiceResultSchema.safeParse(generated.value));

  if (!answer.ok) {
    return answer;
  }

  const outboundId = offerIdIn(offers.outbound, answer.value.outboundId);

  if (outboundId === undefined) {
    return err(unknownOffer(answer.value.outboundId));
  }

  const inboundId = offerIdIn(offers.inbound, answer.value.inboundId);

  if (inboundId === undefined) {
    return err(unknownOffer(answer.value.inboundId));
  }

  const lodgingId = optionalOfferIdIn(offers.lodging, answer.value.lodgingId);

  if (!lodgingId.ok) {
    return lodgingId;
  }

  const diningId = optionalOfferIdIn(offers.dining, answer.value.diningId);

  if (!diningId.ok) {
    return diningId;
  }

  const leisureId = optionalOfferIdIn(offers.leisure, answer.value.leisureId);

  if (!leisureId.ok) {
    return leisureId;
  }

  return ok({
    outboundId,
    inboundId,
    ...(lodgingId.value === undefined ? {} : { lodgingId: lodgingId.value }),
    ...(diningId.value === undefined ? {} : { diningId: diningId.value }),
    ...(leisureId.value === undefined ? {} : { leisureId: leisureId.value }),
    rationale: answer.value.rationale,
  });
};

/**
 * Gemini に予定の解釈と候補の選択をさせる planner
 *
 * 日付は予定から計算し、価格は候補の集合から引くので、LLM が答えるのは目的地と用件と候補の id だけ
 * 予算と宿の要否の検査は `assemblePlan` に任せる
 * 状態を持たないのでプロセスに 1 つでよい
 */
export const createGeminiPlanner = (deps: GeminiPlannerDeps): PlannerPort => {
  return {
    interpretEvent: (event, context) => interpret(event, context, deps),
    choosePlan: (intent, offers, context) =>
      choose(intent, offers, context, deps),
  };
};
