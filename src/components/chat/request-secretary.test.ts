import { describe, expect, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { FetchLike } from "@/lib/http";
import type { MandateResponse, TripResponse } from "@/lib/secretary-response";
import {
  requestApproveTrip,
  requestPayForTrip,
  requestProposeTrip,
  requestSetUpMandate,
  requestWriteBackTrip,
} from "./request-secretary";

const TRIP_ID = tripIdAt(1);

const MANDATE_BODY = {
  cap: 150000,
  expiresAt: "2026-10-10T09:00:00+09:00",
  purpose: "9 月の出張",
};

const MANDATE: MandateResponse = {
  id: "mandate-1",
  cap: { amount: 150000, currency: "MST" },
  spent: { amount: 0, currency: "MST" },
  expiresAt: "2026-10-10T09:00:00+09:00",
  purpose: "9 月の出張",
  commitment: "commitment-1",
};

const TRIP: TripResponse = {
  status: "proposed",
  id: TRIP_ID,
  event: {
    id: "seed-2",
    title: "大阪出張 (取引先訪問)",
    when: {
      kind: "timed",
      start: "2026-09-15T10:00:00+09:00",
      end: "2026-09-15T17:00:00+09:00",
    },
  },
  plan: {
    intent: {
      destination: "大阪",
      departOn: "2026-09-15",
      returnOn: "2026-09-15",
      purpose: "取引先訪問",
    },
    outbound: {
      id: "rail-tokyo-osaka",
      mode: "rail",
      vendor: "デモ鉄道",
      payee: "wallet-rail",
      origin: "東京",
      destination: "新大阪",
      departAt: "2026-09-15T09:00:00+09:00",
      arriveAt: "2026-09-15T11:30:00+09:00",
      price: { amount: 14720, currency: "MST" },
    },
    inbound: {
      id: "rail-osaka-tokyo",
      mode: "rail",
      vendor: "デモ鉄道",
      payee: "wallet-rail",
      origin: "新大阪",
      destination: "東京",
      departAt: "2026-09-15T18:00:00+09:00",
      arriveAt: "2026-09-15T20:30:00+09:00",
      price: { amount: 14720, currency: "MST" },
    },
    total: { amount: 29440, currency: "MST" },
    rationale: "日帰りで往復できる",
  },
  proposedAt: "2026-09-10T00:00:00Z",
};

const JSON_HEADERS = { "content-type": "application/json" };

type Recorded = {
  url: string;
  init: RequestInit | undefined;
};

type Recorder = {
  calls: readonly Recorded[];
};

const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), { status });
};

// 呼び出しの記録はテストの本体で見たいので、このクロージャに閉じた入れ物へ代入する
const recordingFetch = (
  recorder: Recorder,
  respond: () => Response,
): FetchLike => {
  return async (input, init) => {
    recorder.calls = [...recorder.calls, { url: String(input), init }];

    return respond();
  };
};

const newRecorder = (): Recorder => {
  return { calls: [] };
};

const failureBody = (code: string, extra: object): unknown => {
  return { error: { code, message: `${code} for the test`, ...extra } };
};

describe("requestSetUpMandate", () => {
  test("mandate のパスに JSON の body を POST し、201 の応答を返す", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: MANDATE }, 201),
    );

    expect(await requestSetUpMandate(fetchFn, MANDATE_BODY)).toStrictEqual({
      ok: true,
      value: MANDATE,
    });
    expect(recorder.calls).toStrictEqual([
      {
        url: "/api/secretary/mandate",
        init: {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(MANDATE_BODY),
        },
      },
    ]);
  });

  test("409 の use case の失敗は source と kind を持つ", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(
        failureBody("secretary", {
          detail: { source: "flow", error: { kind: "mandateExists" } },
        }),
        409,
      ),
    );

    expect(await requestSetUpMandate(fetchFn, MANDATE_BODY)).toStrictEqual({
      ok: false,
      error: {
        code: "secretary",
        error: { source: "flow", error: { kind: "mandateExists" } },
      },
    });
  });

  test("401 は unauthorized になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(failureBody("unauthorized", {}), 401),
    );

    expect(await requestSetUpMandate(fetchFn, MANDATE_BODY)).toStrictEqual({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  test("422 は issues を持つ invalid_request になる", async () => {
    const recorder = newRecorder();
    const issues = [{ path: ["cap"], message: "invalid" }];
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(failureBody("invalid_request", { issues }), 422),
    );

    expect(await requestSetUpMandate(fetchFn, MANDATE_BODY)).toStrictEqual({
      ok: false,
      error: { code: "invalid_request", issues },
    });
  });

  test("fetch が reject したら network になる", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("offline");
    };

    expect(await requestSetUpMandate(fetchFn, MANDATE_BODY)).toStrictEqual({
      ok: false,
      error: { code: "network" },
    });
  });

  test("JSON でない body は schema になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(
      recorder,
      () => new Response("not json", { status: 201 }),
    );

    expect(await requestSetUpMandate(fetchFn, MANDATE_BODY)).toStrictEqual({
      ok: false,
      error: { code: "schema" },
    });
  });

  test("成功でも形が違う body は schema になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { id: "mandate-1" } }, 201),
    );

    expect(await requestSetUpMandate(fetchFn, MANDATE_BODY)).toStrictEqual({
      ok: false,
      error: { code: "schema" },
    });
  });
});

describe("requestProposeTrip", () => {
  test("trips のパスに JSON の body を POST し、201 の出張を返す", async () => {
    const recorder = newRecorder();
    const body = { eventId: "seed-2", locale: "ja" } as const;
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: TRIP }, 201),
    );

    expect(await requestProposeTrip(fetchFn, body)).toStrictEqual({
      ok: true,
      value: TRIP,
    });
    expect(recorder.calls).toStrictEqual([
      {
        url: "/api/secretary/trips",
        init: {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        },
      },
    ]);
  });
});

describe("requestApproveTrip", () => {
  test("approve のパスへ公開範囲を body にして POST する", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: TRIP }),
    );
    const body = { visibility: { lodging: "private" } } as const;

    expect(await requestApproveTrip(fetchFn, TRIP_ID, body)).toStrictEqual({
      ok: true,
      value: TRIP,
    });
    expect(recorder.calls).toStrictEqual([
      {
        url: `/api/secretary/trips/${TRIP_ID}/approve`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      },
    ]);
  });
});

describe("requestPayForTrip", () => {
  test("pay のパスを body 無しで POST する", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: TRIP }),
    );

    expect(await requestPayForTrip(fetchFn, TRIP_ID)).toStrictEqual({
      ok: true,
      value: TRIP,
    });
    expect(recorder.calls).toStrictEqual([
      { url: `/api/secretary/trips/${TRIP_ID}/pay`, init: { method: "POST" } },
    ]);
  });

  test("パスに使えない文字を含む id はエンコードする", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: TRIP }),
    );

    await requestPayForTrip(fetchFn, "trip/../other");

    expect(recorder.calls).toStrictEqual([
      {
        url: "/api/secretary/trips/trip%2F..%2Fother/pay",
        init: { method: "POST" },
      },
    ]);
  });
});

describe("requestWriteBackTrip", () => {
  test("write-back のパスに locale の body を POST する", async () => {
    const recorder = newRecorder();
    const body = { locale: "ja" } as const;
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: TRIP }),
    );

    expect(await requestWriteBackTrip(fetchFn, TRIP_ID, body)).toStrictEqual({
      ok: true,
      value: TRIP,
    });
    expect(recorder.calls).toStrictEqual([
      {
        url: `/api/secretary/trips/${TRIP_ID}/write-back`,
        init: {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        },
      },
    ]);
  });
});
