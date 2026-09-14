import type { TripId, UserId } from "@/domain/identifiers";
import type {
  ConfirmedTrip,
  MandateLink,
  SecretaryStore,
} from "@/domain/store";
import type { Trip } from "@/domain/trip";
import { ok } from "@/lib/result";
import { confirmedTripOfWritten } from "./trip-rows";

type UserRecord = {
  trips: Readonly<Record<TripId, Trip>>;
  confirmed: Readonly<Record<TripId, ConfirmedTrip>>;
  link?: MandateLink;
};

type FakeStoreState = {
  users: Readonly<Record<UserId, UserRecord>>;
};

const EMPTY_USER: UserRecord = { trips: {}, confirmed: {} };

const userOf = (state: FakeStoreState, userId: UserId): UserRecord => {
  const user = state.users[userId];

  if (user === undefined) {
    return EMPTY_USER;
  }

  return user;
};

// 行はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const putUser = (
  state: FakeStoreState,
  userId: UserId,
  user: UserRecord,
): void => {
  state.users = { ...state.users, [userId]: user };
};

const byProposedAtDesc = (a: Trip, b: Trip): number => {
  return Date.parse(b.proposedAt) - Date.parse(a.proposedAt);
};

const byStartDateDesc = (a: ConfirmedTrip, b: ConfirmedTrip): number => {
  return Date.parse(b.startDate) - Date.parse(a.startDate);
};

/**
 * ユーザ id をキーにしたメモリ上の store
 *
 * プロセス開始時は空で、再起動すると何も残らない
 * あるリクエストで書いた trip が次のリクエストで見えるよう、プロセスごとに 1 回だけ作る
 * 確定旅程も同じメモリに置き、`code` からサービス行の id を引かないので `resolveServiceId` は使わない
 */
export const createFakeStore = (): SecretaryStore => {
  const state: FakeStoreState = { users: {} };

  return {
    getTrip: async (userId, tripId) => ok(userOf(state, userId).trips[tripId]),
    listTrips: async (userId) =>
      ok(Object.values(userOf(state, userId).trips).toSorted(byProposedAtDesc)),
    putTrip: async (userId, trip) => {
      const user = userOf(state, userId);

      putUser(state, userId, {
        ...user,
        trips: { ...user.trips, [trip.id]: trip },
      });

      return ok(undefined);
    },
    getMandateLink: async (userId) => ok(userOf(state, userId).link),
    putMandateLink: async (userId, link) => {
      putUser(state, userId, { ...userOf(state, userId), link });

      return ok(undefined);
    },
    listConfirmedTrips: async (userId) =>
      ok(
        Object.values(userOf(state, userId).confirmed).toSorted(
          byStartDateDesc,
        ),
      ),
    putConfirmedTrip: async (userId, trip) => {
      const user = userOf(state, userId);

      if (user.confirmed[trip.id] !== undefined) {
        return ok(undefined);
      }

      putUser(state, userId, {
        ...user,
        confirmed: {
          ...user.confirmed,
          [trip.id]: confirmedTripOfWritten(trip),
        },
      });

      return ok(undefined);
    },
  };
};
