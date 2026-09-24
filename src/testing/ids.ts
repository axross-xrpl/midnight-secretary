import type { FakeCatalogIds } from "@/adapters/catalog/fake";
import type { NewTripId } from "@/application/deps";
import type { IsoDateTime, TripId } from "@/domain/identifiers";
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

/**
 * テストで使う、読める固定のサービス行の id (UUID の形)
 *
 * Route Handler と画面はサービス行の id を uuid として検査するので、連番を UUID の形に埋める
 * 出張 id (`tripIdAt`) と混ざらないよう、連番は末尾の 12 桁に置く
 */
export const serviceIdAt = (n: number): string => {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
};

/**
 * 連番のサービス行の id と止まった時計を返す、Fake のカタログの採番の Stub
 *
 * n 回目の `newServiceId` は `serviceIdAt(n)` を返し、`now` は常に引数の時刻を返す
 * 採番はテスト設定に閉じているので、閉じたカウンタで数える
 */
export const testCatalogIds = (now: IsoDateTime): FakeCatalogIds => {
  const state = { issued: 0 };

  return {
    newServiceId: () => {
      state.issued = state.issued + 1;

      return serviceIdAt(state.issued);
    },
    now: () => now,
  };
};
