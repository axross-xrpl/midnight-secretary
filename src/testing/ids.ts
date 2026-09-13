import type { NewTripId } from "@/application/deps";
import type { TripId } from "@/domain/identifiers";
import { mustParse, parseTripId } from "@/domain/identifiers.parse";

/**
 * テストで使う、読める固定の出張 id (UUID の形)
 *
 * 本番の採番は randomUUID なので、テストでは連番を UUID の形に埋めて値を固定する
 * 真ん中の 4000 と 8000 は UUID v4 の版と variant の位置に合わせた飾りで、parseTripId は形しか見ない
 */
export const tripIdAt = (n: number): string => {
  return `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
};

/**
 * 連番の n 番目の TripId (sequentialTripIds の Stub が n 回目に返す値)
 */
export const tripIdOf = (n: number): TripId => {
  return mustParse(parseTripId(tripIdAt(n)));
};

/**
 * どの Fake にも無い出張 id
 */
export const UNKNOWN_TRIP_ID: TripId = tripIdOf(99999999);

/**
 * 連番で TripId を返す newTripId の Stub
 *
 * 採番はテスト設定に閉じているので、閉じたカウンタで数える
 */
export const sequentialTripIds = (): NewTripId => {
  const state = { issued: 0 };

  return () => {
    state.issued = state.issued + 1;

    return tripIdOf(state.issued);
  };
};
