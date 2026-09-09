import type { Result } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type { CalendarEvent } from "./calendar";
import type { OfferSet } from "./catalog";
import type { IsoDateTime } from "./identifiers";
import type { Locale } from "./locale";
import type { Money } from "./money";
import type { PlanChoice, TravelerPreferences, TripIntent } from "./plan";

/**
 * カレンダーの予定を出張として読み取るための文脈
 *
 * プランナーは `knownDestinations` から目的地を選ぶか、出張ではないと答えなければならない
 */
export type InterpretContext = {
  locale: Locale;
  now: IsoDateTime;
  knownDestinations: readonly string[];
};

/**
 * 候補の中から選ぶための文脈
 *
 * `budget` は mandate (支払い枠) の残り
 */
export type ChoiceContext = {
  locale: Locale;
  preferences: TravelerPreferences;
  budget: Money;
};

/**
 * プランナー (裏側は LLM) で起こりうる失敗
 */
export type PlannerError =
  | { kind: "notATrip"; reason: string }
  | { kind: "noViableChoice"; reason: string }
  | { kind: "llm"; cause: unknown }
  | SchemaError;

/**
 * カレンダーの予定を読んで出張の意図を取り出す
 */
export type InterpretEvent = (
  event: CalendarEvent,
  context: InterpretContext,
) => Promise<Result<TripIntent, PlannerError>>;

/**
 * 出張の意図に合う候補を選ぶ
 *
 * 返すのは id だけで、組み立ては `assemblePlan` を参照
 */
export type ChoosePlan = (
  intent: TripIntent,
  offers: OfferSet,
  context: ChoiceContext,
) => Promise<Result<PlanChoice, PlannerError>>;

/**
 * プラン作成の機能 (LLM)
 *
 * 状態を持たず、全ユーザで共有する
 */
export type PlannerPort = {
  interpretEvent: InterpretEvent;
  choosePlan: ChoosePlan;
};
