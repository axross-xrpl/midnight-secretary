import { describe, expect, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { FetchLike } from "@/lib/http";
import type {
  AuthorizationResponse,
  TripResponse,
} from "@/lib/secretary-response";
import { escrowOf, requestConfirmReceipt } from "./request-confirm-receipt";

const TRIP_ID = tripIdAt(1);

const PAYMENT_REF = `trip:${TRIP_ID}:rail-tokyo-osaka`;

const RAIL = {
  id: "rail-tokyo-osaka",
  mode: "rail",
  vendor: "デモ鉄道",
  payee: "wallet-rail",
  origin: "東京",
  destination: "新大阪",
  departAt: "2026-09-15T09:00:00+09:00",
  arriveAt: "2026-09-15T11:30:00+09:00",
  price: { amount: 14720, currency: "MST" },
} as const;

const HELD: AuthorizationResponse = {
  mandateId: "mandate-1",
  paymentRef: PAYMENT_REF,
  amount: { amount: 14720, currency: "MST" },
  authorizedAt: "2026-09-10T00:02:00Z",
  publicHash: "hash:mandate-1:rail-tokyo-osaka",
  settlement: {
    kind: "tokenTransfer",
    transactionId: "tx-1",
    recipient: "wallet-rail",
  },
  escrow: { status: "held", heldAt: "2026-09-10T00:02:00Z" },
};

const RELEASED: AuthorizationResponse = {
  ...HELD,
  escrow: {
    status: "released",
    heldAt: "2026-09-10T00:02:00Z",
    releasedAt: "2026-09-16T00:00:00Z",
    releaseRef: "release-1",
  },
};

const OTHER: AuthorizationResponse = {
  ...HELD,
  paymentRef: `trip:${TRIP_ID}:rail-osaka-tokyo`,
  publicHash: "hash:mandate-1:rail-osaka-tokyo",
};

const BASE = {
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
    outbound: RAIL,
    inbound: { ...RAIL, id: "rail-osaka-tokyo" },
    total: { amount: 29440, currency: "MST" },
    rationale: "日帰りで往復できる",
  },
  proposedAt: "2026-09-10T00:00:00Z",
} as const;

const PROPOSED: TripResponse = { status: "proposed", ...BASE };

const PAID: TripResponse = {
  status: "paid",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: { outbound: "public", inbound: "public" },
  authorizations: [RELEASED, OTHER],
  paidAt: "2026-09-10T00:02:00Z",
};

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

describe("requestConfirmReceipt", () => {
  test("confirm のパスを body 無しで POST し、更新された出張を返す", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: PAID }),
    );

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({ ok: true, value: PAID });
    expect(recorder.calls).toStrictEqual([
      {
        url: `/api/secretary/trips/${TRIP_ID}/payments/${encodeURIComponent(PAYMENT_REF)}/confirm`,
        init: { method: "POST" },
      },
    ]);
  });

  test("支払い参照のコロンとスラッシュはエンコードする", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: PAID }),
    );

    await requestConfirmReceipt(fetchFn, "trip/../other", "a:b/c");

    expect(recorder.calls).toStrictEqual([
      {
        url: "/api/secretary/trips/trip%2F..%2Fother/payments/a%3Ab%2Fc/confirm",
        init: { method: "POST" },
      },
    ]);
  });

  test("409 の notPaid は source と kind を持つ", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(
        failureBody("secretary", {
          detail: {
            source: "flow",
            error: { kind: "notPaid", tripId: TRIP_ID },
          },
        }),
        409,
      ),
    );

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({
      ok: false,
      error: {
        code: "secretary",
        error: {
          source: "flow",
          error: { kind: "notPaid", tripId: TRIP_ID },
        },
      },
    });
  });

  test("409 の notHeld は mandate の失敗になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(
        failureBody("secretary", {
          detail: { source: "mandate", error: { kind: "notHeld" } },
        }),
        409,
      ),
    );

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({
      ok: false,
      error: {
        code: "secretary",
        error: { source: "mandate", error: { kind: "notHeld" } },
      },
    });
  });

  test("401 は unauthorized になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(failureBody("unauthorized", {}), 401),
    );

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({ ok: false, error: { code: "unauthorized" } });
  });

  test("422 は issues を持つ invalid_request になる", async () => {
    const recorder = newRecorder();
    const issues = [{ path: ["paymentRef"], message: "invalid" }];
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(failureBody("invalid_request", { issues }), 422),
    );

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({ ok: false, error: { code: "invalid_request", issues } });
  });

  test("fetch が reject したら network になる", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("offline");
    };

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({ ok: false, error: { code: "network" } });
  });

  test("JSON でない body は schema になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(
      recorder,
      () => new Response("not json", { status: 200 }),
    );

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({ ok: false, error: { code: "schema" } });
  });

  test("成功でも形が違う body は schema になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { id: TRIP_ID } }),
    );

    expect(
      await requestConfirmReceipt(fetchFn, TRIP_ID, PAYMENT_REF),
    ).toStrictEqual({ ok: false, error: { code: "schema" } });
  });
});

describe("escrowOf", () => {
  test("応答の出張から支払い参照の預かりの状態を引く", () => {
    expect(escrowOf(PAID, PAYMENT_REF)).toStrictEqual(RELEASED.escrow);
  });

  test("知らない支払い参照なら undefined", () => {
    expect(escrowOf(PAID, "trip:none")).toBeUndefined();
  });

  test("提案済みの出張には支払いが無いので undefined", () => {
    expect(escrowOf(PROPOSED, PAYMENT_REF)).toBeUndefined();
  });
});
