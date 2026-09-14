import { match } from "ts-pattern";
import type { ConfirmedTrip } from "@/domain/store";
import { filterMap } from "@/lib/array";
import type { ScanEvent, ScanEventTime } from "@/lib/calendar-scan-response";
import type { TripResponse } from "@/lib/secretary-response";

// 秘書が書き戻した予定の id (written の trip だけが持つ)
const writtenEventIdOf = (trip: TripResponse): string | undefined => {
  if (trip.status !== "written") {
    return undefined;
  }

  return trip.writtenEventId;
};

// 確定旅程が占めている予定 id (元の予定と、書き戻した予定)
const confirmedEventIdsOf = (trip: ConfirmedTrip): readonly string[] => {
  // sourceEventId が無い行 (旧データ) は元の予定を持たないので、書き戻した予定だけになる
  return [
    ...(trip.sourceEventId === undefined ? [] : [trip.sourceEventId]),
    ...filterMap(trip.items, (item) => item.googleEventId),
  ];
};

// 予定の開始の時点 (終日は開始日の始まり)
const startMs = (when: ScanEventTime): number => {
  return match(when)
    .with({ kind: "allDay" }, ({ startDate }) => Date.parse(startDate))
    .with({ kind: "timed" }, ({ start }) => Date.parse(start))
    .exhaustive();
};

const byEventStart = (a: TripResponse, b: TripResponse): number => {
  return startMs(a.event.when) - startMs(b.event.when);
};

const byStartDate = (a: ConfirmedTrip, b: ConfirmedTrip): number => {
  return Date.parse(a.startDate) - Date.parse(b.startDate);
};

const isActive = (trip: TripResponse): boolean => {
  return trip.status !== "written";
};

/**
 * 手配できる予定 (スキャン結果のうち trip の無いもの)
 *
 * 同じ予定 id の trip があるもの、秘書が書き戻した予定 (written の trip の `writtenEventId`)、DB の確定旅程が占めている予定 (`sourceEventId` と明細の `googleEventId`) は除く
 * メモリの trip はサーバの再起動で消えるので、確定旅程の除外が無いと登録済みの予定が再びスキャンに載る
 * 順序は `events` の順序 (カレンダーが返す日時順) のまま
 */
export const candidateEventsOf = (
  events: readonly ScanEvent[],
  trips: readonly TripResponse[],
  confirmed: readonly ConfirmedTrip[],
): readonly ScanEvent[] => {
  const taken = [
    ...trips.map((trip) => trip.event.id),
    ...filterMap(trips, writtenEventIdOf),
    ...confirmed.flatMap(confirmedEventIdsOf),
  ];

  return events.filter((event) => !taken.includes(event.id));
};

/**
 * 手配中の出張 (written 以外の trip) を予定の開始順に
 */
export const activeTripsOf = (
  trips: readonly TripResponse[],
): readonly TripResponse[] => {
  return trips.filter(isActive).toSorted(byEventStart);
};

/**
 * 確定旅程を出発日の古い順に
 *
 * store は新しい順で返すので、一覧の並び (古い順) はここで決める
 */
export const confirmedTripsOf = (
  trips: readonly ConfirmedTrip[],
): readonly ConfirmedTrip[] => {
  return trips.toSorted(byStartDate);
};
