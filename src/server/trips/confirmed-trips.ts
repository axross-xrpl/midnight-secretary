import "server-only";

import { getSecretaryRuntime } from "@/adapters/runtime";
import type { ConfirmedTrip } from "@/features/trips/confirmed-trip";
import { fakeConfirmedTrips } from "./fake-confirmed-trips";
import { readConfirmedTrips } from "./read-confirmed-trips";

/**
 * 画面に出す確定旅程を読む
 *
 * どこから取るかは既存の `SECRETARY_STORE` (サーバ側の永続化の source) に従う。
 * `real` は NeonDB の `trips` / `trip_items`、`fake` はプロセス内の確定旅程
 * 画面の上部には `FakeNotice` が出るので、fake を見ていることは利用者にも分かる
 */
export async function loadConfirmedTrips(
  userId: string,
): Promise<readonly ConfirmedTrip[]> {
  const { sources } = getSecretaryRuntime();

  if (sources.store === "fake") {
    return fakeConfirmedTrips();
  }

  return readConfirmedTrips(userId);
}
