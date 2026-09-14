import { describe, expect, test } from "vitest";
import type { CalendarPort } from "@/domain/calendar";
import type { FareCatalogPort } from "@/domain/catalog";
import type { TripId } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDateTime,
  parseTripId,
} from "@/domain/identifiers.parse";
import type { IdentityPort } from "@/domain/identity";
import type { MandatePort } from "@/domain/mandate";
import type { PlannerPort } from "@/domain/planner";
import type { ProfilePort } from "@/domain/profile";
import type { SecretaryStore } from "@/domain/store";
import { err, ok } from "@/lib/result";
import { DEMO_SOURCES, REAL_SOURCES } from "./sources";
import type { RequestContext, SecretaryFactories } from "./wiring";
import { buildSecretaryDeps } from "./wiring";

const TRIP_ID: TripId = mustParse(
  parseTripId("2f9d4c1e-1a4c-4a7a-9c2e-1c9f0a8b7d55"),
);

const CONTEXT: RequestContext = {
  now: mustParse(parseIsoDateTime("2026-09-09T09:00:00+09:00")),
};

const stubCalendar = (): CalendarPort => {
  return {
    listEvents: async () => ok([]),
    getEvent: async () => ok(undefined),
    insertEvent: async () => err({ kind: "forbidden" }),
  };
};

// 目的地の一覧に文字列を載せるだけで、どのファクトリが作った port かが値で判る
const stubCatalog = (destinations: readonly string[]): FareCatalogPort => {
  return {
    listDestinations: async () => ok(destinations),
    findOffers: async () =>
      ok({
        outbound: [],
        inbound: [],
        lodging: [],
        dining: [],
        leisure: [],
      }),
    resolveServiceIds: async () => err({ kind: "unavailable", cause: "stub" }),
  };
};

const stubPlanner = (): PlannerPort => {
  return {
    interpretEvent: async () => err({ kind: "notATrip", reason: "stub" }),
    choosePlan: async () => err({ kind: "noViableChoice", reason: "stub" }),
  };
};

const stubMandate = (): MandatePort => {
  return {
    capabilities: { privateSettlement: false },
    createMandate: async () => err({ kind: "unavailable", cause: "stub" }),
    authorizePayment: async () => err({ kind: "unavailable", cause: "stub" }),
    readMandate: async () => ok(undefined),
    isAuthorized: async () => ok(false),
    readPublicLedger: async () =>
      ok({ commitments: [], authorizations: [], authorizedCount: 0 }),
  };
};

const stubStore = (): SecretaryStore => {
  return {
    getTrip: async () => ok(undefined),
    listTrips: async () => ok([]),
    putTrip: async () => ok(undefined),
    getMandateLink: async () => ok(undefined),
    putMandateLink: async () => ok(undefined),
    listConfirmedTrips: async () => ok([]),
    putConfirmedTrip: async () => ok(undefined),
  };
};

const stubIdentity = (): IdentityPort => {
  return {
    registerBirthDate: async () => err({ kind: "unavailable", cause: "stub" }),
    readRegistration: async () => ok(undefined),
    proveAdult: async () => err({ kind: "notRegistered" }),
  };
};

const stubProfile = (): ProfilePort => {
  return {
    readBirthDate: async () => ok(undefined),
  };
};

const buildStubs = () => {
  const real = {
    calendar: stubCalendar(),
    planner: stubPlanner(),
    mandate: stubMandate(),
    store: stubStore(),
    identity: stubIdentity(),
    profile: stubProfile(),
  };
  const fake = {
    calendar: stubCalendar(),
    catalog: stubCatalog(["fake catalog"]),
    planner: stubPlanner(),
    mandate: stubMandate(),
    store: stubStore(),
    identity: stubIdentity(),
    profile: stubProfile(),
  };
  const factories: SecretaryFactories = {
    calendar: { real: () => real.calendar, fake: () => fake.calendar },
    // real 側だけ context から作り、context が届いていることを目的地の値で確かめる
    catalog: {
      real: (context) => stubCatalog([context.now]),
      fake: () => fake.catalog,
    },
    planner: { real: () => real.planner, fake: () => fake.planner },
    mandate: { real: () => real.mandate, fake: () => fake.mandate },
    store: { real: () => real.store, fake: () => fake.store },
    identity: { real: () => real.identity, fake: () => fake.identity },
    profile: { real: () => real.profile, fake: () => fake.profile },
    newTripId: () => TRIP_ID,
  };

  return { factories, real, fake };
};

describe("buildSecretaryDeps", () => {
  test("全て real なら real のファクトリが作った port を渡す", async () => {
    const { factories, real } = buildStubs();

    const deps = buildSecretaryDeps(REAL_SOURCES, factories, CONTEXT);

    expect(deps.calendar).toBe(real.calendar);
    expect(deps.planner).toBe(real.planner);
    expect(deps.mandate).toBe(real.mandate);
    expect(deps.store).toBe(real.store);
    expect(deps.identity).toBe(real.identity);
    expect(deps.profile).toBe(real.profile);
    expect(await deps.catalog.listDestinations()).toStrictEqual({
      ok: true,
      value: [CONTEXT.now],
    });
  });

  test("全て fake なら fake のファクトリが作った port を渡す", async () => {
    const { factories, fake } = buildStubs();

    const deps = buildSecretaryDeps(DEMO_SOURCES, factories, CONTEXT);

    expect(deps.calendar).toBe(fake.calendar);
    expect(deps.catalog).toBe(fake.catalog);
    expect(deps.planner).toBe(fake.planner);
    expect(deps.mandate).toBe(fake.mandate);
    expect(deps.store).toBe(fake.store);
    expect(deps.identity).toBe(fake.identity);
    expect(deps.profile).toBe(fake.profile);
  });

  test("identity と profile のレーンも個別に選び分ける", () => {
    const { factories, real, fake } = buildStubs();

    const deps = buildSecretaryDeps(
      { ...REAL_SOURCES, identity: "fake" },
      factories,
      CONTEXT,
    );

    expect(deps.identity).toBe(fake.identity);
    expect(deps.profile).toBe(real.profile);
  });

  test("port ごとに real と fake を選び分ける", () => {
    const { factories, real, fake } = buildStubs();

    const deps = buildSecretaryDeps(
      { ...REAL_SOURCES, calendar: "fake", store: "fake" },
      factories,
      CONTEXT,
    );

    expect(deps.calendar).toBe(fake.calendar);
    expect(deps.store).toBe(fake.store);
    expect(deps.planner).toBe(real.planner);
    expect(deps.mandate).toBe(real.mandate);
  });

  test("newTripId はそのまま渡す", () => {
    const { factories } = buildStubs();

    const deps = buildSecretaryDeps(REAL_SOURCES, factories, CONTEXT);

    expect(deps.newTripId()).toBe(TRIP_ID);
  });
});
