import { describe, expect, test } from "vitest";
import type { SecretaryError } from "@/application/errors";
import type { TripId } from "@/domain/identifiers";
import { mustParse, parseTripId } from "@/domain/identifiers.parse";
import {
  describeCause,
  serializableSecretaryError,
  statusOf,
} from "./responses";

const tripId = (raw: string): TripId => {
  return mustParse(parseTripId(raw));
};

const TRIP_ID = tripId("3f0f5a3e-9f4a-4a1e-8a3d-2b7c1f9a0e11");

describe("describeCause", () => {
  test("Error は name と message にする", () => {
    expect(describeCause(new TypeError("boom"))).toBe("TypeError: boom");
  });

  test("文字列はそのまま返す", () => {
    expect(describeCause("boom")).toBe("boom");
  });

  test("オブジェクトは JSON にする", () => {
    expect(describeCause({ status: 503 })).toBe('{"status":503}');
  });
});

describe("serializableSecretaryError", () => {
  test("cause を持つ失敗は cause を文字列にする", () => {
    const error: SecretaryError = {
      source: "store",
      error: { kind: "unavailable", cause: new Error("closed") },
    };

    expect(serializableSecretaryError(error)).toStrictEqual({
      source: "store",
      error: { kind: "unavailable", cause: "Error: closed" },
    });
  });

  test("cause を持たない失敗はそのまま返す", () => {
    const error: SecretaryError = {
      source: "flow",
      error: { kind: "noMandate" },
    };

    expect(serializableSecretaryError(error)).toStrictEqual(error);
  });
});

describe("statusOf", () => {
  test("カレンダーのサインイン切れは 401 になる", () => {
    expect(
      statusOf({ source: "calendar", error: { kind: "tokenExpired" } }),
    ).toBe(401);
  });

  test("見つからない出張は 404 になる", () => {
    expect(
      statusOf({
        source: "flow",
        error: { kind: "tripNotFound", tripId: TRIP_ID },
      }),
    ).toBe(404);
  });

  test("状態の順序違いは 409 になる", () => {
    expect(
      statusOf({
        source: "flow",
        error: {
          kind: "wrongStatus",
          tripId: TRIP_ID,
          expected: "approved",
          actual: "proposed",
        },
      }),
    ).toBe(409);
  });

  test("プランの予算超過は 422 になる", () => {
    expect(
      statusOf({
        source: "planner",
        error: { kind: "noViableChoice", reason: "no offer" },
      }),
    ).toBe(422);
  });

  test("外部システムの不調は 502 になる", () => {
    expect(
      statusOf({
        source: "mandate",
        error: { kind: "unavailable", cause: "node down" },
      }),
    ).toBe(502);
  });
});
