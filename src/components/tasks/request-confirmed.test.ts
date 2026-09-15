import { describe, expect, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { FetchLike } from "@/lib/http";
import { requestDeleteConfirmedTrip } from "./request-confirmed";

const TRIP_ID = tripIdAt(1);

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

describe("requestDeleteConfirmedTrip", () => {
  test("確定旅程のパスを body 無しで DELETE する", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { id: TRIP_ID } }),
    );

    expect(await requestDeleteConfirmedTrip(fetchFn, TRIP_ID)).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(recorder.calls).toStrictEqual([
      {
        url: `/api/secretary/confirmed-trips/${TRIP_ID}`,
        init: { method: "DELETE" },
      },
    ]);
  });

  test("パスに使えない文字を含む id はエンコードする", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { id: "trip" } }),
    );

    await requestDeleteConfirmedTrip(fetchFn, "trip/../other");

    expect(recorder.calls).toStrictEqual([
      {
        url: "/api/secretary/confirmed-trips/trip%2F..%2Fother",
        init: { method: "DELETE" },
      },
    ]);
  });

  test("fetch が reject したら network になる", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("offline");
    };

    expect(await requestDeleteConfirmedTrip(fetchFn, TRIP_ID)).toStrictEqual({
      ok: false,
      error: { code: "network" },
    });
  });

  test("JSON でない body は schema になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(
      recorder,
      () => new Response("not json", { status: 200 }),
    );

    expect(await requestDeleteConfirmedTrip(fetchFn, TRIP_ID)).toStrictEqual({
      ok: false,
      error: { code: "schema" },
    });
  });

  test("成功でも形が違う body は schema になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () => jsonResponse({ data: {} }));

    expect(await requestDeleteConfirmedTrip(fetchFn, TRIP_ID)).toStrictEqual({
      ok: false,
      error: { code: "schema" },
    });
  });

  test("422 は issues を持つ invalid_request になる", async () => {
    const recorder = newRecorder();
    const issues = [{ path: ["tripId"], message: "invalid" }];
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "The request is invalid",
            issues,
          },
        },
        422,
      ),
    );

    expect(await requestDeleteConfirmedTrip(fetchFn, TRIP_ID)).toStrictEqual({
      ok: false,
      error: { code: "invalid_request", issues },
    });
  });
});
