import type { OfferId, PaymentRef, TripId } from "./identifiers";

/**
 * 出張の中の候補 1 件に対する支払い参照を導出する
 *
 * 決定的 (deterministic) なので、同じ候補の支払いを再試行しても二重に承認されない
 * adapter がこれをハッシュして circuit に渡す
 */
export const paymentRefFor = (tripId: TripId, offerId: OfferId): PaymentRef => {
  return `trip:${tripId}:${offerId}` as PaymentRef;
};
