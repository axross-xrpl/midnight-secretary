import type { CalendarEvent } from "@/domain/calendar";
import type {
  OfferSet,
  PlaceOffer,
  TransportMode,
  TransportOffer,
} from "@/domain/catalog";
import { nightsBetween } from "@/domain/dates";
import type { OfferId } from "@/domain/identifiers";
import type { PlanChoice, TripIntent } from "@/domain/plan";
import type {
  ChoiceContext,
  InterpretContext,
  PlannerError,
  PlannerPort,
} from "@/domain/planner";
import { isDefined } from "@/lib/array";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { datesOf } from "./event-dates";

const RATIONALE = "Fake planner: first matching offers";

// 題名にこれらの語があれば飲食の場を取る
// Gemini planner も同じ規則を写す (T6-3 / T8-3)
const DINING_CUES = [
  "懇親会",
  "会食",
  "飲み会",
  "居酒屋",
] as const satisfies readonly string[];

// 題名にこれらの語があればレジャーの場を取る
const LEISURE_CUES = [
  "視察",
  "観光",
  "見学",
] as const satisfies readonly string[];

const IZAKAYA_GENRE = "居酒屋";

// 選んだ場ごとに理由の末尾へ足す句
const RATIONALE_NOTES = {
  dining: "with a dining place for the gathering",
  leisure: "with a leisure place for the visit",
} as const satisfies Record<"dining" | "leisure", string>;

const mentions = (event: CalendarEvent, destination: string): boolean => {
  return (
    event.title.includes(destination) ||
    (event.location ?? "").includes(destination)
  );
};

const interpret = (
  event: CalendarEvent,
  context: InterpretContext,
): Result<TripIntent, PlannerError> => {
  const destination = context.knownDestinations.find((known) =>
    mentions(event, known),
  );

  if (destination === undefined) {
    return err({
      kind: "notATrip",
      reason: "no known destination in title or location",
    });
  }

  return ok({ destination, ...datesOf(event.when), purpose: event.title });
};

const preferredOffer = (
  offers: readonly TransportOffer[],
  preferred: TransportMode | undefined,
): TransportOffer | undefined => {
  return offers.find((offer) => offer.mode === preferred) ?? offers.at(0);
};

const chooseLodgingId = (
  intent: TripIntent,
  offers: OfferSet,
): OfferId | undefined => {
  if (nightsBetween(intent.departOn, intent.returnOn) <= 0) {
    return undefined;
  }

  return offers.lodging.at(0)?.id;
};

const mentionsAny = (intent: TripIntent, cues: readonly string[]): boolean => {
  return cues.some((cue) => intent.purpose.includes(cue));
};

// 居酒屋を優先し、無ければ飲食の先頭を取る
const chooseDining = (
  intent: TripIntent,
  offers: OfferSet,
): PlaceOffer | undefined => {
  if (!mentionsAny(intent, DINING_CUES)) {
    return undefined;
  }

  const izakaya = offers.dining.find((offer) => offer.genre === IZAKAYA_GENRE);

  return izakaya ?? offers.dining.at(0);
};

const needsNoVerification = (offer: PlaceOffer): boolean => {
  return offer.requiredVerifications.length === 0;
};

// レジャーは本人確認の要らない候補を優先し、無ければ先頭を取る
// 飲食と違い種類を絞る手がかりが題名に無いので、誰でも申し込める候補を先に出す
const chooseLeisure = (
  intent: TripIntent,
  offers: OfferSet,
): PlaceOffer | undefined => {
  if (!mentionsAny(intent, LEISURE_CUES)) {
    return undefined;
  }

  return offers.leisure.find(needsNoVerification) ?? offers.leisure.at(0);
};

// 選んだ場ごとの句を理由に足す (場が無ければ基本の理由のまま)
const rationaleOf = (
  dining: PlaceOffer | undefined,
  leisure: PlaceOffer | undefined,
): string => {
  const notes = [
    dining === undefined ? undefined : RATIONALE_NOTES.dining,
    leisure === undefined ? undefined : RATIONALE_NOTES.leisure,
  ].filter(isDefined);

  return [RATIONALE, ...notes].join(", ");
};

const choose = (
  intent: TripIntent,
  offers: OfferSet,
  context: ChoiceContext,
): Result<PlanChoice, PlannerError> => {
  const outbound = preferredOffer(
    offers.outbound,
    context.preferences.preferredTransport,
  );
  const inbound = preferredOffer(
    offers.inbound,
    context.preferences.preferredTransport,
  );

  if (outbound === undefined || inbound === undefined) {
    return err({
      kind: "noViableChoice",
      reason: "no outbound or inbound offer",
    });
  }

  const lodgingId = chooseLodgingId(intent, offers);
  const dining = chooseDining(intent, offers);
  const leisure = chooseLeisure(intent, offers);

  return ok({
    outboundId: outbound.id,
    inboundId: inbound.id,
    ...(lodgingId === undefined ? {} : { lodgingId }),
    ...(dining === undefined ? {} : { diningId: dining.id }),
    ...(leisure === undefined ? {} : { leisureId: leisure.id }),
    rationale: rationaleOf(dining, leisure),
  });
};

/**
 * LLM を使わない決定的な planner
 *
 * `interpretEvent` はタイトルか場所で最初に見つかった既知の目的地と、予定の日付を取る
 * `choosePlan` はカタログにあれば希望の交通手段を取り、滞在が 1 泊以上なら最初の宿泊を取る
 * 予定の題名 (= `purpose`) が 懇親会 / 会食 / 飲み会 / 居酒屋 のいずれかを含めば、飲食の候補から居酒屋 (無ければ先頭) を取る
 * 題名が 視察 / 観光 / 見学 のいずれかを含めば、レジャーの候補から本人確認の要らない先頭 (無ければ先頭) を取る
 * 予算は `assemblePlan` に任せ、そちらが mandate で賄えない計画を弾く
 */
export const createFakePlanner = (): PlannerPort => {
  return {
    interpretEvent: async (event, context) => interpret(event, context),
    choosePlan: async (intent, offers, context) =>
      choose(intent, offers, context),
  };
};
