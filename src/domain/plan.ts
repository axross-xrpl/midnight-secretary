import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type {
  LodgingOffer,
  OfferQuery,
  OfferSet,
  PlaceOffer,
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
 * 出張者の好み
 *
 * `diningGenres` / `leisureGenres` は空配列なら好みなし
 */
export type TravelerPreferences = {
  homeStation: string;
  preferredTransport?: TransportMode;
  diningGenres: readonly string[];
  leisureGenres: readonly string[];
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
  diningId?: OfferId;
  leisureId?: OfferId;
  rationale: string;
};

/**
 * 検証済みのプランで、カタログから解決した選択済みの候補と計算した合計を持つ
 *
 * `dining` と `leisure` は目的地で使う場で、合計と支払いに入る
 */
export type TripPlan = {
  intent: TripIntent;
  outbound: TransportOffer;
  inbound: TransportOffer;
  lodging?: LodgingOffer;
  dining?: PlaceOffer;
  leisure?: PlaceOffer;
  total: Money;
  rationale: string;
};

/**
 * 計画が成人であることを要する候補を含むなら、その候補と年齢の下限
 *
 * `requiredVerifications` に `age` を含む `dining` が対象
 * `ageLimit` が無ければ 20
 */
export type AdultRequirement = {
  offer: PlaceOffer;
  ageLimit: number;
};

// 年齢制限つきの候補が下限を持たないときの既定 (飲酒の下限)
const DEFAULT_AGE_LIMIT = 20;

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

// 宿泊、飲食、レジャーは選ばれていないこともあるので、未選択と実在しない id を分けて返す
const optionalOfferById = <T extends { id: OfferId }>(
  offers: readonly T[],
  offerId: OfferId | undefined,
): Result<T | undefined, PlanAssemblyError> => {
  if (offerId === undefined) {
    return ok(undefined);
  }

  const offer = offers.find((candidate) => candidate.id === offerId);

  if (offer === undefined) {
    return err({ kind: "unknownOffer", offerId });
  }

  return ok(offer);
};

const optionalPrice = (
  offer: LodgingOffer | PlaceOffer | undefined,
): readonly Money[] => {
  if (offer === undefined) {
    return [];
  }

  return [offer.price];
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

  const lodging = optionalOfferById(offers.lodging, choice.lodgingId);

  if (!lodging.ok) {
    return lodging;
  }

  const dining = optionalOfferById(offers.dining, choice.diningId);

  if (!dining.ok) {
    return dining;
  }

  const leisure = optionalOfferById(offers.leisure, choice.leisureId);

  if (!leisure.ok) {
    return leisure;
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
    ...optionalPrice(lodging.value),
    ...optionalPrice(dining.value),
    ...optionalPrice(leisure.value),
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
    ...(dining.value === undefined ? {} : { dining: dining.value }),
    ...(leisure.value === undefined ? {} : { leisure: leisure.value }),
    total: total.value,
    rationale: choice.rationale,
  });
};

/**
 * 計画が成人であることを要する候補を含むなら、その候補と年齢の下限
 *
 * 純粋関数
 * Wave 1 で年齢制限を持ちうるのは飲食だけなので `dining` だけを見る
 */
export const adultRequirementOf = (
  plan: TripPlan,
): AdultRequirement | undefined => {
  const dining = plan.dining;

  if (dining === undefined || !dining.requiredVerifications.includes("age")) {
    return undefined;
  }

  return { offer: dining, ageLimit: dining.ageLimit ?? DEFAULT_AGE_LIMIT };
};
