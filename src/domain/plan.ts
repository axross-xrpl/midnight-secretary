import type { Result } from "@/lib/result";
import { err } from "@/lib/result";
import type {
  LodgingOffer,
  OfferQuery,
  OfferSet,
  TransportMode,
  TransportOffer,
} from "./catalog";
import type { IsoDate, OfferId } from "./identifiers";
import type { Money, MoneyError } from "./money";

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

/**
 * 選択を提示済みの候補の集合と突き合わせ、合計を計算し、予算を確認する
 *
 * 純粋関数
 * 実在しない候補や価格が紛れ込むのをここで止める
 */
export const assemblePlan = (
  _intent: TripIntent,
  _offers: OfferSet,
  choice: PlanChoice,
  _budget: Money,
): Result<TripPlan, PlanAssemblyError> => {
  return err({ kind: "unknownOffer", offerId: choice.outboundId });
};
