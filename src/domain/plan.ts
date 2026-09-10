import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type {
  LodgingOffer,
  OfferQuery,
  OfferSet,
  TransportMode,
  TransportOffer,
} from "./catalog";
import { nightsBetween } from "./dates";
import type { IsoDate, OfferId } from "./identifiers";
import type { Money, MoneyError } from "./money";
import { compareMoney, sumMoney } from "./money";

/**
 * プランナーがカレンダーの予定から読み取った内容
 */
export type TripIntent = {
  destination: string;
  departOn: IsoDate;
  returnOn: IsoDate;
  purpose: string;
};

/**
 * プランを提案するときに使う、出張者の変わらない好み
 */
export type TravelerPreferences = {
  homeStation: string;
  preferredTransport?: TransportMode;
  notes?: string;
};

/**
 * プランナーの選択を候補の id だけで表したもの
 *
 * 価格はプランナーからは決して受け取らず、候補の集合から引く
 */
export type PlanChoice = {
  outboundId: OfferId;
  inboundId: OfferId;
  lodgingId?: OfferId;
  rationale: string;
};

/**
 * 検証済みのプランで、カタログから解決した選択済みの候補と計算した合計を持つ
 */
export type TripPlan = {
  intent: TripIntent;
  outbound: TransportOffer;
  inbound: TransportOffer;
  lodging?: LodgingOffer;
  total: Money;
  rationale: string;
};

/**
 * 選択をプランに組み立てるときに起こりうる失敗
 */
export type PlanAssemblyError =
  | { kind: "unknownOffer"; offerId: OfferId }
  | { kind: "lodgingRequired"; nights: number }
  | { kind: "lodgingNotAllowed" }
  | { kind: "overBudget"; budget: Money; total: Money }
  | MoneyError;

/**
 * 出張の意図からカタログへの問い合わせ条件を組み立てる
 *
 * 出発地は出張者の最寄り駅から取る
 */
export const offerQueryFor = (
  intent: TripIntent,
  preferences: TravelerPreferences,
): OfferQuery => {
  return {
    origin: preferences.homeStation,
    destination: intent.destination,
    departOn: intent.departOn,
    returnOn: intent.returnOn,
  };
};

// 選ばれた id を候補の集合から引く
// 集合の外の id は「実在しない候補」なので、価格を引く前に止める
const transportById = (
  offers: readonly TransportOffer[],
  offerId: OfferId,
): Result<TransportOffer, PlanAssemblyError> => {
  const offer = offers.find((candidate) => candidate.id === offerId);

  if (offer === undefined) {
    return err({ kind: "unknownOffer", offerId });
  }

  return ok(offer);
};

// 宿泊は選ばれていないこともあるので、未選択と実在しない id を分けて返す
const lodgingById = (
  offers: readonly LodgingOffer[],
  offerId: OfferId | undefined,
): Result<LodgingOffer | undefined, PlanAssemblyError> => {
  if (offerId === undefined) {
    return ok(undefined);
  }

  const offer = offers.find((candidate) => candidate.id === offerId);

  if (offer === undefined) {
    return err({ kind: "unknownOffer", offerId });
  }

  return ok(offer);
};

const lodgingPrices = (lodging: LodgingOffer | undefined): readonly Money[] => {
  if (lodging === undefined) {
    return [];
  }

  return [lodging.price];
};

/**
 * 選択を提示済みの候補の集合と突き合わせ、合計を計算し、予算を確認する
 *
 * 純粋関数
 * 実在しない候補や価格が紛れ込むのをここで止める
 */
export const assemblePlan = (
  intent: TripIntent,
  offers: OfferSet,
  choice: PlanChoice,
  budget: Money,
): Result<TripPlan, PlanAssemblyError> => {
  const outbound = transportById(offers.outbound, choice.outboundId);

  if (!outbound.ok) {
    return outbound;
  }

  const inbound = transportById(offers.inbound, choice.inboundId);

  if (!inbound.ok) {
    return inbound;
  }

  const lodging = lodgingById(offers.lodging, choice.lodgingId);

  if (!lodging.ok) {
    return lodging;
  }

  const nights = nightsBetween(intent.departOn, intent.returnOn);

  if (nights > 0 && lodging.value === undefined) {
    return err({ kind: "lodgingRequired", nights });
  }

  if (nights <= 0 && lodging.value !== undefined) {
    return err({ kind: "lodgingNotAllowed" });
  }

  const prices: readonly [Money, ...Money[]] = [
    outbound.value.price,
    inbound.value.price,
    ...lodgingPrices(lodging.value),
  ];
  const total = sumMoney(prices);

  if (!total.ok) {
    return total;
  }

  const compared = compareMoney(total.value, budget);

  if (!compared.ok) {
    return compared;
  }

  if (compared.value === 1) {
    return err({ kind: "overBudget", budget, total: total.value });
  }

  return ok({
    intent,
    outbound: outbound.value,
    inbound: inbound.value,
    ...(lodging.value === undefined ? {} : { lodging: lodging.value }),
    total: total.value,
    rationale: choice.rationale,
  });
};
