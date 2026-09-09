import type { CalendarEvent, EventTime } from "@/domain/calendar";
import type { OfferSet, TransportMode, TransportOffer } from "@/domain/catalog";
import type { IsoDate, OfferId } from "@/domain/identifiers";
import type { PlanChoice, TripIntent } from "@/domain/plan";
import type {
  ChoiceContext,
  InterpretContext,
  PlannerError,
  PlannerPort,
} from "@/domain/planner";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { addDays, jstDateOf, nightsBetween } from "../jst";

const RATIONALE = "Fake planner: first matching offers";

const mentions = (event: CalendarEvent, destination: string): boolean => {
  return (
    event.title.includes(destination) ||
    (event.location ?? "").includes(destination)
  );
};

// 終日の予定は `endDate` の始まりで終わるので、旅行者はその前日に戻る
const lastDayOf = (startDate: IsoDate, endDate: IsoDate): IsoDate => {
  const lastDay = addDays(endDate, -1);

  if (lastDay < startDate) {
    return startDate;
  }

  return lastDay;
};

const datesOf = (
  when: EventTime,
): Pick<TripIntent, "departOn" | "returnOn"> => {
  if (when.kind === "allDay") {
    return {
      departOn: when.startDate,
      returnOn: lastDayOf(when.startDate, when.endDate),
    };
  }

  return { departOn: jstDateOf(when.start), returnOn: jstDateOf(when.end) };
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

  return ok({
    outboundId: outbound.id,
    inboundId: inbound.id,
    ...(lodgingId === undefined ? {} : { lodgingId }),
    rationale: RATIONALE,
  });
};

/**
 * LLM を使わない決定的な planner
 *
 * `interpretEvent` はタイトルか場所で最初に見つかった既知の目的地と、予定の日付を取る
 * `choosePlan` はカタログにあれば希望の交通手段を取り、滞在が 1 泊以上なら最初の宿泊を取る
 * 予算は `assemblePlan` に任せ、そちらが mandate で賄えない計画を弾く
 */
export const createFakePlanner = (): PlannerPort => {
  return {
    interpretEvent: async (event, context) => interpret(event, context),
    choosePlan: async (intent, offers, context) =>
      choose(intent, offers, context),
  };
};
