import { describe, expect, test } from "vitest";
import type { FetchLike } from "@/lib/http";
import {
  requestIssueAgeCredential,
  requestReadAgeCredential,
} from "./request-age-credential";

const CREDENTIAL = {
  identity: "identity:user-1",
  origin: { kind: "memory", registeredAt: "2026-09-09T00:00:00Z" },
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

describe("requestReadAgeCredential", () => {
  test("証明書のパスを body 無しで GET する", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { credential: CREDENTIAL } }),
    );

    expect(await requestReadAgeCredential(fetchFn)).toStrictEqual({
      ok: true,
      value: CREDENTIAL,
    });
    expect(recorder.calls).toStrictEqual([
      { url: "/api/secretary/age-credential", init: { method: "GET" } },
    ]);
  });

  test("未発行の null は undefined になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { credential: null } }),
    );

    expect(await requestReadAgeCredential(fetchFn)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("fetch が reject したら network になる", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("offline");
    };

    expect(await requestReadAgeCredential(fetchFn)).toStrictEqual({
      ok: false,
      error: { code: "network" },
    });
  });
});

describe("requestIssueAgeCredential", () => {
  test("証明書のパスを body 無しで POST し、発行された証明書を返す", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { credential: CREDENTIAL } }),
    );

    expect(await requestIssueAgeCredential(fetchFn)).toStrictEqual({
      ok: true,
      value: CREDENTIAL,
    });
    expect(recorder.calls).toStrictEqual([
      { url: "/api/secretary/age-credential", init: { method: "POST" } },
    ]);
  });

  test("fetch が reject したら network になる", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("offline");
    };

    expect(await requestIssueAgeCredential(fetchFn)).toStrictEqual({
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

    expect(await requestIssueAgeCredential(fetchFn)).toStrictEqual({
      ok: false,
      error: { code: "schema" },
    });
  });

  test("成功なのに証明書が無い body は schema になる", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse({ data: { credential: null } }),
    );

    expect(await requestIssueAgeCredential(fetchFn)).toStrictEqual({
      ok: false,
      error: { code: "schema" },
    });
  });

  test("422 は use case の失敗として返る", async () => {
    const recorder = newRecorder();
    const fetchFn = recordingFetch(recorder, () =>
      jsonResponse(
        {
          error: {
            code: "secretary",
            message: "flow.birthDateMissing",
            detail: { source: "flow", error: { kind: "birthDateMissing" } },
          },
        },
        422,
      ),
    );

    expect(await requestIssueAgeCredential(fetchFn)).toStrictEqual({
      ok: false,
      error: {
        code: "secretary",
        error: { source: "flow", error: { kind: "birthDateMissing" } },
      },
    });
  });
});
