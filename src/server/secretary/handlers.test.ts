import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test } from "vitest";
import { sequentialTripIds, UNKNOWN_TRIP_ID } from "@/testing/ids";
import type { SecretaryContext } from "@/adapters/auth/session";
import {
  createFakeCalendar,
  seedCalendarEvents,
} from "@/adapters/calendar/fake";
import { createFakeCatalog, seedCatalog } from "@/adapters/catalog/fake";
import type { FakeIdentityIds } from "@/adapters/identity/fake";
import { createFakeIdentity } from "@/adapters/identity/fake";
import { jstDateOf } from "@/adapters/jst";
import type { FakeMandateIds } from "@/adapters/mandate/fake";
import { createFakeMandate } from "@/adapters/mandate/fake";
import { createFakePlanner } from "@/adapters/planner/fake";
import { createFakeProfile } from "@/adapters/profile/fake";
import { createFakeStore } from "@/adapters/store/fake";
import type { SecretaryDeps } from "@/application/deps";
import { addDays, yearsBefore } from "@/domain/dates";
import type {
  CalendarEventId,
  IsoDateTime,
  MandateId,
} from "@/domain/identifiers";
import {
  mustParse,
  parseCalendarEventId,
  parseIsoDateTime,
  parseMandateId,
  parseTripId,
  parseUserId,
} from "@/domain/identifiers.parse";
import {
  parseMandateResponse,
  parseSecretaryFailure,
  parseTripResponse,
} from "@/lib/secretary-response";
import type { SecretaryHandlerDeps } from "./handlers";
import {
  handleApproveTrip,
  handlePayForTrip,
  handleProposeTrip,
  handleReplanTrip,
  handleSetUpMandate,
  handleWriteBackTrip,
} from "./handlers";
import type { WriteBackTranslate } from "./write-back-text";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const eventId = (raw: string): CalendarEventId => {
  return mustParse(parseCalendarEventId(raw));
};

const mandateId = (raw: string): MandateId => {
  return mustParse(parseMandateId(raw));
};

const NOW = at("2026-09-09T00:00:00Z");

const USER = mustParse(parseUserId("user-1"));

// demo と同じ式で、予約者は NOW の 7 日後 (2026-09-16) に 20 歳になる
// seed-5 (+6 日) の出発日はまだ 20 歳前、seed-6 (+9 日) の出発日は 20 歳以上
const BIRTH_DATE = yearsBefore(addDays(jstDateOf(NOW), 7), 20);

const MANDATE_BODY = {
  cap: 200000,
  expiresAt: "2026-12-31T23:59:59+09:00",
  purpose: "出張手配",
};

const testEventIds = (): (() => CalendarEventId) => {
  const state = { issued: 0 };

  return () => {
    state.issued = state.issued + 1;

    return eventId(`written-${state.issued}`);
  };
};

const testMandateIds = (): FakeMandateIds => {
  const state = { issued: 0, sent: 0 };

  return {
    newMandateId: () => {
      state.issued = state.issued + 1;

      return mandateId(`mandate-${state.issued}`);
    },
    newCommitment: () => `commitment-${state.issued}`,
    newTransactionId: () => {
      state.sent = state.sent + 1;

      return `tx-${state.sent}`;
    },
    hashAuthorization: (id, ref) => `hash:${id}:${ref}`,
  };
};

// 採番はテスト設定に閉じているので、identity はユーザ id から、証明の参照は閉じたカウンタで作る
const testIdentityIds = (): FakeIdentityIds => {
  const state = { proved: 0 };

  return {
    identityOf: (id) => `identity:${id}`,
    newProofRef: () => {
      state.proved = state.proved + 1;

      return `proof-${state.proved}`;
    },
  };
};

const testDeps = (): SecretaryDeps => {
  return {
    calendar: createFakeCalendar({
      events: seedCalendarEvents(NOW),
      newEventId: testEventIds(),
    }),
    catalog: createFakeCatalog(seedCatalog()),
    planner: createFakePlanner(),
    mandate: createFakeMandate({ mandates: [], ids: testMandateIds() }),
    store: createFakeStore(),
    identity: createFakeIdentity({ ids: testIdentityIds() }),
    profile: createFakeProfile({ birthDate: BIRTH_DATE }),
    newTripId: sequentialTripIds(),
  };
};

// キーと values の名前をそのまま文字列にする Stub
const stubTranslate: WriteBackTranslate = (key, values) => {
  if (values === undefined) {
    return key;
  }

  return `${key}:${Object.keys(values).join(",")}`;
};

// Fake は状態を持つので、同じテストの中の複数リクエストには同じ文脈を返す
const handlerDepsFor = (context: SecretaryContext): SecretaryHandlerDeps => {
  return {
    resolveContext: async () => ({ ok: true, value: context }),
    loadTranslate: async () => stubTranslate,
  };
};

const signedOutDeps = (): SecretaryHandlerDeps => {
  return {
    resolveContext: async () => ({
      ok: false,
      error: { kind: "unauthenticated" },
    }),
    loadTranslate: async () => stubTranslate,
  };
};

const postRequest = (path: string, body?: unknown): NextRequest => {
  if (body === undefined) {
    return new NextRequest(`http://localhost${path}`, { method: "POST" });
  }

  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

const brokenJsonRequest = (path: string): NextRequest => {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
};

// テストごとに Fake を組み直すので、文脈と deps は 1 つの入れ物に置いて beforeEach で入れ替える
const state = {
  context: { userId: USER, deps: testDeps(), now: NOW },
  deps: signedOutDeps(),
};

beforeEach(() => {
  state.context = { userId: USER, deps: testDeps(), now: NOW };
  state.deps = handlerDepsFor(state.context);
});

const setUpMandateRequest = async (): Promise<Response> => {
  return handleSetUpMandate(
    postRequest("/api/secretary/mandate", MANDATE_BODY),
    state.deps,
  );
};

const proposeRequest = async (event: string): Promise<Response> => {
  return handleProposeTrip(
    postRequest("/api/secretary/trips", { eventId: event, locale: "ja" }),
    state.deps,
  );
};

const approveRequest = async (
  id: string,
  visibility: unknown = {},
): Promise<Response> => {
  return handleApproveTrip(
    postRequest(`/api/secretary/trips/${id}/approve`, { visibility }),
    id,
    state.deps,
  );
};

const replanRequest = async (
  id: string,
  body: unknown = { locale: "ja" },
): Promise<Response> => {
  return handleReplanTrip(
    postRequest(`/api/secretary/trips/${id}/replan`, body),
    id,
    state.deps,
  );
};

// body の形そのものを確かめるテスト用に、封筒を組まずそのまま送る
const rawApproveRequest = async (
  id: string,
  body?: unknown,
): Promise<Response> => {
  return handleApproveTrip(
    postRequest(`/api/secretary/trips/${id}/approve`, body),
    id,
    state.deps,
  );
};

// 非公開に対応していない adapter を持つ文脈 (他は同じ Fake)
const withoutPrivateSettlement = (
  context: SecretaryContext,
): SecretaryContext => {
  return {
    ...context,
    deps: {
      ...context.deps,
      mandate: {
        ...context.deps.mandate,
        capabilities: { privateSettlement: false },
      },
    },
  };
};

const payRequest = async (id: string): Promise<Response> => {
  return handlePayForTrip(
    postRequest(`/api/secretary/trips/${id}/pay`),
    id,
    state.deps,
  );
};

const writeBackRequest = async (id: string): Promise<Response> => {
  return handleWriteBackTrip(
    postRequest(`/api/secretary/trips/${id}/write-back`, { locale: "ja" }),
    id,
    state.deps,
  );
};

// 提案された出張の id を、共有スキーマを通して取り出す
const proposedTripId = async (event: string): Promise<string> => {
  const trip = parseTripResponse(await (await proposeRequest(event)).json());

  if (!trip.ok) {
    throw new Error("test: the proposed trip could not be parsed");
  }

  return trip.value.id;
};

describe("サインインしていないとき", () => {
  test("6 つの handler すべてが 401 を返す", async () => {
    const deps = signedOutDeps();
    const responses = await Promise.all([
      handleSetUpMandate(postRequest("/api/secretary/mandate", {}), deps),
      handleProposeTrip(postRequest("/api/secretary/trips", {}), deps),
      handleApproveTrip(postRequest("/approve"), UNKNOWN_TRIP_ID, deps),
      handleReplanTrip(postRequest("/replan", {}), UNKNOWN_TRIP_ID, deps),
      handlePayForTrip(postRequest("/pay"), UNKNOWN_TRIP_ID, deps),
      handleWriteBackTrip(
        postRequest("/write-back", {}),
        UNKNOWN_TRIP_ID,
        deps,
      ),
    ]);

    expect(responses.map((response) => response.status)).toStrictEqual([
      401, 401, 401, 401, 401, 401,
    ]);
    expect(parseSecretaryFailure(await responses[0].json())).toStrictEqual({
      code: "unauthorized",
    });
  });
});

describe("handleSetUpMandate", () => {
  test("mandate を作ると 201 で mandate を返す", async () => {
    const response = await setUpMandateRequest();

    expect(response.status).toBe(201);
    expect(parseMandateResponse(await response.json())).toStrictEqual({
      ok: true,
      value: {
        id: "mandate-1",
        cap: { amount: 200000, currency: "MST" },
        spent: { amount: 0, currency: "MST" },
        expiresAt: "2026-12-31T23:59:59+09:00",
        purpose: "出張手配",
        commitment: "commitment-1",
      },
    });
  });

  test("同じユーザの 2 回目は 409 で mandateExists を返す", async () => {
    await setUpMandateRequest();

    const response = await setUpMandateRequest();

    expect(response.status).toBe(409);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "secretary",
      error: {
        source: "flow",
        error: { kind: "mandateExists", mandateId: "mandate-1" },
      },
    });
  });

  test("JSON として読めない body は 422 になる", async () => {
    const response = await handleSetUpMandate(
      brokenJsonRequest("/api/secretary/mandate"),
      state.deps,
    );

    expect(response.status).toBe(422);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "invalid_request",
      issues: [{ path: [], message: "invalid JSON" }],
    });
  });

  test("形の違う body は 422 で issues を返す", async () => {
    const response = await handleSetUpMandate(
      postRequest("/api/secretary/mandate", { cap: "200000" }),
      state.deps,
    );

    expect(response.status).toBe(422);

    const failure = parseSecretaryFailure(await response.json());

    expect(failure.code).toBe("invalid_request");
    expect(failure).toHaveProperty("issues");
  });
});

describe("handleProposeTrip", () => {
  test("日帰りの予定は 201 で proposed を返す", async () => {
    await setUpMandateRequest();

    const response = await proposeRequest("seed-2");

    expect(response.status).toBe(201);

    const trip = parseTripResponse(await response.json());

    expect(trip.ok && trip.value.status).toBe("proposed");
    expect(trip.ok && trip.value.plan.total).toStrictEqual({
      amount: 28920,
      currency: "MST",
    });
  });

  test("mandate が無ければ 409 で noMandate を返す", async () => {
    const response = await proposeRequest("seed-2");

    expect(response.status).toBe(409);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "secretary",
      error: { source: "flow", error: { kind: "noMandate" } },
    });
  });
});

describe("承認から書き戻しまで", () => {
  test("approve、pay、write-back が 200 で状態を進める", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-3");

    const approved = await approveRequest(id);

    expect(approved.status).toBe(200);
    expect(parseTripResponse(await approved.json())).toMatchObject({
      ok: true,
      value: { status: "approved" },
    });

    const paid = await payRequest(id);

    expect(paid.status).toBe(200);
    expect(parseTripResponse(await paid.json())).toMatchObject({
      ok: true,
      value: { status: "paid", authorizations: [{}, {}, {}] },
    });

    const written = await writeBackRequest(id);

    expect(written.status).toBe(200);
    expect(parseTripResponse(await written.json())).toMatchObject({
      ok: true,
      value: { status: "written", writtenEventId: "written-1" },
    });
  });

  test("書き戻した予定のタイトルは Stub の翻訳関数の値になる", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-3");

    await approveRequest(id);
    await payRequest(id);
    await writeBackRequest(id);

    const inserted = await state.context.deps.calendar.getEvent(
      eventId("written-1"),
    );

    expect(inserted.ok && inserted.value?.title).toBe("title:destination");
  });

  test("承認を 2 回すると 409 で wrongStatus を返す", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-2");

    await approveRequest(id);

    const response = await approveRequest(id);

    expect(response.status).toBe(409);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "secretary",
      error: {
        source: "flow",
        error: {
          kind: "wrongStatus",
          tripId: id,
          expected: "proposed",
          actual: "approved",
        },
      },
    });
  });

  test("宿を非公開にして承認すると 200 で公開範囲を返す", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-3");

    const response = await approveRequest(id, { lodging: "private" });

    expect(response.status).toBe(200);
    expect(parseTripResponse(await response.json())).toMatchObject({
      ok: true,
      value: {
        status: "approved",
        visibility: {
          outbound: "public",
          inbound: "public",
          lodging: "private",
        },
      },
    });
  });

  test("非公開に対応していない支払い枠で非公開を頼むと 422 になる", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-3");

    const response = await handleApproveTrip(
      postRequest(`/api/secretary/trips/${id}/approve`, {
        visibility: { lodging: "private" },
      }),
      id,
      handlerDepsFor(withoutPrivateSettlement(state.context)),
    );

    expect(response.status).toBe(422);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "secretary",
      error: {
        source: "flow",
        error: { kind: "privateSettlementUnsupported", tripId: id },
      },
    });
  });

  test("body の無い承認は 422 になる", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-2");

    const response = await rawApproveRequest(id);

    expect(response.status).toBe(422);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "invalid_request",
      issues: [{ path: [], message: "invalid JSON" }],
    });
  });

  test("形の違う visibility は 422 で issues を返す", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-2");

    const response = await rawApproveRequest(id, {
      visibility: { outbound: "secret" },
    });

    expect(response.status).toBe(422);

    const failure = parseSecretaryFailure(await response.json());

    expect(failure.code).toBe("invalid_request");
    expect(failure).toHaveProperty("issues");
  });

  test("locale の付いた承認は余分なキーとして 422 になる", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-2");

    const response = await rawApproveRequest(id, {
      visibility: {},
      locale: "ja",
    });

    expect(response.status).toBe(422);

    const failure = parseSecretaryFailure(await response.json());

    expect(failure.code).toBe("invalid_request");
    expect(failure).toHaveProperty("issues");
  });

  test("UUID でない tripId は 422 になる", async () => {
    const response = await approveRequest("trip-1");

    expect(response.status).toBe(422);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "invalid_request",
      issues: [{ path: ["tripId"], message: "invalid" }],
    });
  });

  test("知らない UUID は 404 になる", async () => {
    const response = await approveRequest(UNKNOWN_TRIP_ID);

    expect(response.status).toBe(404);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "secretary",
      error: {
        source: "flow",
        error: { kind: "tripNotFound", tripId: UNKNOWN_TRIP_ID },
      },
    });
  });
});

describe("年齢確認つきの承認", () => {
  test("出発日にまだ 20 歳でない出張の承認は 200 で記録つきの提案を返し、store も同じ", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-5");

    const response = await approveRequest(id);

    expect(response.status).toBe(200);

    expect(parseTripResponse(await response.json())).toMatchObject({
      ok: true,
      value: {
        status: "proposed",
        id,
        plan: { dining: { id: "restaurant-izakaya-tenma" } },
        failedAgeCheck: {
          ageLimit: 20,
          cutoffDate: "2006-09-15",
          visibility: {
            outbound: "public",
            inbound: "public",
            dining: "public",
          },
          checkedAt: NOW,
        },
      },
    });

    const stored = await state.context.deps.store.getTrip(
      USER,
      mustParse(parseTripId(id)),
    );

    expect(stored.ok && stored.value?.status).toBe("proposed");
    expect(
      stored.ok &&
        stored.value?.status === "proposed" &&
        stored.value.failedAgeCheck?.ageLimit,
    ).toBe(20);
  });

  test("記録つきの提案の組み直しは 200 で作り直した提案を返し、もう一度は 422 になる", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-5");

    await approveRequest(id);

    const response = await replanRequest(id);

    expect(response.status).toBe(200);
    expect(parseTripResponse(await response.json())).toMatchObject({
      ok: true,
      value: {
        status: "proposed",
        id,
        plan: { dining: { id: "restaurant-cafe-nakanoshima" } },
        revision: {
          reason: {
            kind: "ageNotVerified",
            ageLimit: 20,
            cutoffDate: "2006-09-15",
          },
          previous: { plan: { dining: { id: "restaurant-izakaya-tenma" } } },
        },
      },
    });

    const again = await replanRequest(id);

    expect(again.status).toBe(422);
    expect(parseSecretaryFailure(await again.json())).toStrictEqual({
      code: "secretary",
      error: {
        source: "flow",
        error: { kind: "replanNotNeeded", tripId: id },
      },
    });
  });

  test("組み直した提案の承認は 200 で approved を返し、証明の記録は残らない", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-5");

    await approveRequest(id);
    await replanRequest(id);

    const response = await approveRequest(id);

    expect(response.status).toBe(200);

    const trip = parseTripResponse(await response.json());

    expect(trip.ok && trip.value.status).toBe("approved");
    expect(trip.ok && "ageProof" in trip.value).toBe(false);
    expect(trip.ok && "failedAgeCheck" in trip.value).toBe(false);
    expect(trip.ok && trip.value.revision?.reason.kind).toBe("ageNotVerified");
  });

  test("locale の無い組み直しは 422 で issues を返す", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-5");

    await approveRequest(id);

    const response = await replanRequest(id, {});

    expect(response.status).toBe(422);

    const failure = parseSecretaryFailure(await response.json());

    expect(failure.code).toBe("invalid_request");
    expect(failure).toHaveProperty("issues");
  });

  test("生年月日の無いプロフィールでは 422 で birthDateMissing を返す", async () => {
    // このテストだけ生年月日の無いプロフィールに差し替えるので、beforeEach の入れ物へ再代入する
    state.context = {
      ...state.context,
      deps: { ...state.context.deps, profile: createFakeProfile({}) },
    };
    state.deps = handlerDepsFor(state.context);

    await setUpMandateRequest();
    const id = await proposedTripId("seed-5");

    const response = await approveRequest(id);

    expect(response.status).toBe(422);
    expect(parseSecretaryFailure(await response.json())).toStrictEqual({
      code: "secretary",
      error: {
        source: "flow",
        error: { kind: "birthDateMissing", tripId: id },
      },
    });
  });

  test("出発日に 20 歳以上の出張の承認は 200 で ageProof を載せる", async () => {
    await setUpMandateRequest();
    const id = await proposedTripId("seed-6");

    const response = await approveRequest(id);

    expect(response.status).toBe(200);
    expect(parseTripResponse(await response.json())).toMatchObject({
      ok: true,
      value: {
        status: "approved",
        ageProof: {
          identity: "identity:user-1",
          cutoffDate: "2006-09-18",
          proofRef: "proof-1",
          provedAt: NOW,
        },
      },
    });

    const paid = await payRequest(id);

    expect(paid.status).toBe(200);
    expect(parseTripResponse(await paid.json())).toMatchObject({
      ok: true,
      value: { status: "paid", authorizations: [{}, {}, {}] },
    });
  });
});
