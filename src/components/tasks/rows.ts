import { match } from "ts-pattern";
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

const isWritten = (trip: TripResponse): boolean => {
  return trip.status === "written";
};

const isActive = (trip: TripResponse): boolean => {
  return trip.status !== "written";
};

/**
 * 手配できる予定 (スキャン結果のうち trip の無いもの)
 *
 * 同じ予定 id の trip があるものと、秘書が書き戻した予定 (written の trip の `writtenEventId`) は除く
 * 順序は `events` の順序 (カレンダーが返す日時順) のまま
 */
export const candidateEventsOf = (
  events: readonly ScanEvent[],
  trips: readonly TripResponse[],
): readonly ScanEvent[] => {
  const taken = [
    ...trips.map((trip) => trip.event.id),
    ...filterMap(trips, writtenEventIdOf),
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
 * 確定旅程 (written の trip) を予定の開始順に
 */
export const confirmedTripsOf = (
  trips: readonly TripResponse[],
): readonly TripResponse[] => {
  return trips.filter(isWritten).toSorted(byEventStart);
};
