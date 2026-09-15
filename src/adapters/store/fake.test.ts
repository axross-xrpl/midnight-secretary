import { describe, expect, test } from "vitest";
import type { ResolveServiceId, TransportOffer } from "@/domain/catalog";
import type { TripId, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseMandateId,
  parseOfferId,
  parseTripId,
  parseUserId,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import type { Money } from "@/domain/money";
import type { ProposedTrip, Trip, WrittenTrip } from "@/domain/trip";
import { err } from "@/lib/result";
import { createFakeStore } from "./fake";
import { confirmedTripOfWritten } from "./trip-rows";

const ALICE: UserId = mustParse(parseUserId("alice"));

const BOB: UserId = mustParse(parseUserId("bob"));

const TRIP_1: TripId = mustParse(
  parseTripId("11111111-1111-4111-8111-111111111111"),
);

const TRIP_2: TripId = mustParse(
  parseTripId("22222222-2222-4222-8222-222222222222"),
);

const at = (raw: string) => {
  return mustParse(parseIsoDateTime(raw));
};

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const railOffer = (
  id: string,
  origin: string,
  destination: string,
): TransportOffer => {
  return {
    id: mustParse(parseOfferId(id)),
    mode: "rail",
    vendor: "JR",
    payee: mustParse(parseWalletAddress("demo-payee-jr")),
    origin,
    destination,
    departAt: at("2026-09-14T09:00:00+09:00"),
    arriveAt: at("2026-09-14T11:30:00+09:00"),
    price: mst(14720),
  };
};

const proposedTrip = (id: TripId, proposedAt: string): ProposedTrip => {
  return {
    status: "proposed",
    id,
    event: {
      id: mustParse(parseCalendarEventId(`event-${id}`)),
      title: "大阪出張",
      when: {
        kind: "timed",
        start: at("2026-09-14T10:00:00+09:00"),
        end: at("2026-09-14T17:00:00+09:00"),
      },
    },
    plan: {
      intent: {
        destination: "大阪",
        departOn: mustParse(parseIsoDate("2026-09-14")),
        returnOn: mustParse(parseIsoDate("2026-09-14")),
        purpose: "大阪出張",
      },
      outbound: railOffer("rail-tokyo-osaka", "東京", "大阪"),
      inbound: railOffer("rail-osaka-tokyo", "大阪", "東京"),
      total: mst(29440),
      rationale: "test",
    },
    proposedAt: at(proposedAt),
  };
};

const writtenTrip = (id: TripId, proposedAt: string): WrittenTrip => {
  const proposed = proposedTrip(id, proposedAt);

  return {
    ...proposed,
    status: "written",
    approvedAt: at("2026-09-09T10:00:00+09:00"),
    visibility: { outbound: "public", inbound: "public" },
    authorizations: [],
    paidAt: at("2026-09-09T10:01:00+09:00"),
    writtenEventId: mustParse(parseCalendarEventId(`written-${id}`)),
    writtenAt: at("2026-09-09T10:02:00+09:00"),
  };
};

// 出発日だけを差し替える (確定旅程の並びは出発日で決まる)
const departingOn = (trip: WrittenTrip, departOn: string): WrittenTrip => {
  const date = mustParse(parseIsoDate(departOn));

  return {
    ...trip,
    plan: {
      ...trip.plan,
      intent: { ...trip.plan.intent, departOn: date, returnOn: date },
    },
  };
};

// Fake の store は確定旅程を DB に書かないので、引き直しは呼ばれない
const failingResolve: ResolveServiceId = async () =>
  err({ kind: "unavailable", cause: "not called" });

describe("createFakeStore", () => {
  test("書いた trip を同じユーザーで読み出せる", async () => {
    const store = createFakeStore();
    const trip = proposedTrip(TRIP_1, "2026-09-09T09:00:00+09:00");

    expect(await store.putTrip(ALICE, trip)).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(await store.getTrip(ALICE, TRIP_1)).toStrictEqual({
      ok: true,
      value: trip,
    });
  });

  test("ユーザーごとに分かれている", async () => {
    const store = createFakeStore();
    const trip = proposedTrip(TRIP_1, "2026-09-09T09:00:00+09:00");

    await store.putTrip(ALICE, trip);

    expect(await store.getTrip(BOB, TRIP_1)).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(await store.listTrips(BOB)).toStrictEqual({ ok: true, value: [] });
  });

  test("listTrips は proposedAt の降順で返す", async () => {
    const store = createFakeStore();
    const older = proposedTrip(TRIP_1, "2026-09-09T09:00:00+09:00");
    const newer = proposedTrip(TRIP_2, "2026-09-10T09:00:00+09:00");

    await store.putTrip(ALICE, older);
    await store.putTrip(ALICE, newer);

    const listed = await store.listTrips(ALICE);

    expect(listed.ok && listed.value.map((trip) => trip.id)).toStrictEqual([
      TRIP_2,
      TRIP_1,
    ]);
  });

  test("同じ id の trip は置き換わる", async () => {
    const store = createFakeStore();
    const proposed = proposedTrip(TRIP_1, "2026-09-09T09:00:00+09:00");
    const approved: Trip = {
      ...proposed,
      status: "approved",
      approvedAt: at("2026-09-09T10:00:00+09:00"),
      visibility: { outbound: "public", inbound: "public" },
      authorizations: [],
    };

    await store.putTrip(ALICE, proposed);
    await store.putTrip(ALICE, approved);

    const listed = await store.listTrips(ALICE);

    expect(listed.ok && listed.value).toStrictEqual([approved]);
  });

  test("mandate のリンクはユーザーごとに保存する", async () => {
    const store = createFakeStore();
    const link = {
      mandateId: mustParse(parseMandateId("mandate-1")),
      linkedAt: at("2026-09-09T09:00:00+09:00"),
    };

    expect(await store.getMandateLink(ALICE)).toStrictEqual({
      ok: true,
      value: undefined,
    });

    await store.putMandateLink(ALICE, link);

    expect(await store.getMandateLink(ALICE)).toStrictEqual({
      ok: true,
      value: link,
    });
    expect(await store.getMandateLink(BOB)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("確定旅程は書き戻した trip から作り、同じ id を 2 回書いても 1 件のまま", async () => {
    const store = createFakeStore();
    const trip = writtenTrip(TRIP_1, "2026-09-09T09:00:00+09:00");

    expect(await store.listConfirmedTrips(ALICE)).toStrictEqual({
      ok: true,
      value: [],
    });
    expect(
      await store.putConfirmedTrip(ALICE, trip, failingResolve),
    ).toStrictEqual({ ok: true, value: undefined });
    await store.putConfirmedTrip(ALICE, trip, failingResolve);

    const listed = await store.listConfirmedTrips(ALICE);

    expect(listed.ok && listed.value).toStrictEqual([
      confirmedTripOfWritten(trip),
    ]);
    expect(await store.listConfirmedTrips(BOB)).toStrictEqual({
      ok: true,
      value: [],
    });
  });

  test("確定旅程は出発日の新しい順で返る", async () => {
    const store = createFakeStore();
    const older = writtenTrip(TRIP_1, "2026-09-09T09:00:00+09:00");
    const newer = departingOn(
      writtenTrip(TRIP_2, "2026-09-10T09:00:00+09:00"),
      "2026-09-20",
    );

    await store.putConfirmedTrip(ALICE, older, failingResolve);
    await store.putConfirmedTrip(ALICE, newer, failingResolve);

    const listed = await store.listConfirmedTrips(ALICE);

    expect(listed.ok && listed.value.map((trip) => trip.id)).toStrictEqual([
      TRIP_2,
      TRIP_1,
    ]);
  });

  test("確定旅程を消すと一覧から消え、無い id でも成功する", async () => {
    const store = createFakeStore();
    const trip = writtenTrip(TRIP_1, "2026-09-09T09:00:00+09:00");

    await store.putConfirmedTrip(ALICE, trip, failingResolve);

    expect(await store.deleteConfirmedTrip(ALICE, TRIP_1)).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(await store.listConfirmedTrips(ALICE)).toStrictEqual({
      ok: true,
      value: [],
    });
    expect(await store.deleteConfirmedTrip(ALICE, TRIP_2)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("確定旅程を消しても他のユーザーの分は残る", async () => {
    const store = createFakeStore();
    const trip = writtenTrip(TRIP_1, "2026-09-09T09:00:00+09:00");

    await store.putConfirmedTrip(ALICE, trip, failingResolve);
    await store.putConfirmedTrip(BOB, trip, failingResolve);
    await store.deleteConfirmedTrip(ALICE, TRIP_1);

    expect(await store.listConfirmedTrips(ALICE)).toStrictEqual({
      ok: true,
      value: [],
    });
    expect(await store.listConfirmedTrips(BOB)).toStrictEqual({
      ok: true,
      value: [confirmedTripOfWritten(trip)],
    });
  });

  test("確定旅程を消しても進行中の trip は残る", async () => {
    const store = createFakeStore();
    const trip = writtenTrip(TRIP_1, "2026-09-09T09:00:00+09:00");

    await store.putTrip(ALICE, trip);
    await store.putConfirmedTrip(ALICE, trip, failingResolve);
    await store.deleteConfirmedTrip(ALICE, TRIP_1);

    expect(await store.getTrip(ALICE, TRIP_1)).toStrictEqual({
      ok: true,
      value: trip,
    });
  });

  test("リンクを保存しても trip は残る", async () => {
    const store = createFakeStore();
    const trip = proposedTrip(TRIP_1, "2026-09-09T09:00:00+09:00");

    await store.putTrip(ALICE, trip);
    await store.putMandateLink(ALICE, {
      mandateId: mustParse(parseMandateId("mandate-1")),
      linkedAt: at("2026-09-09T09:00:00+09:00"),
    });

    expect(await store.getTrip(ALICE, TRIP_1)).toStrictEqual({
      ok: true,
      value: trip,
    });
  });
});
