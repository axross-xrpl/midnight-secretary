import { describe, expect, test } from "vitest";
import type { FetchLike } from "./http";
import { isAccessTokenExpired, refreshGoogleAccessToken } from "./google-token";

const credentials = { clientId: "client-id", clientSecret: "client-secret" };

const nowMs = Date.parse("2026-09-10T00:00:00Z");

const nowSeconds = nowMs / 1000;

describe("isAccessTokenExpired", () => {
  test("期限が無ければ期限切れとして扱う", () => {
    expect(isAccessTokenExpired(undefined, nowMs)).toBe(true);
  });

  test("余裕の 1 分より先に切れるトークンは有効", () => {
    expect(isAccessTokenExpired(nowSeconds + 120, nowMs)).toBe(false);
  });

  test("1 分以内に切れるトークンは期限切れとして扱う", () => {
    expect(isAccessTokenExpired(nowSeconds + 30, nowMs)).toBe(true);
  });
});

describe("refreshGoogleAccessToken", () => {
  test("refresh_token で更新し、期限を秒単位の UNIX 時刻に直す", async () => {
    const fetchStub: FetchLike = async (input, init) => {
      expect(String(input)).toBe("https://oauth2.googleapis.com/token");
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toBe(
        "client_id=client-id&client_secret=client-secret&grant_type=refresh_token&refresh_token=refresh-1",
      );

      return new Response(
        JSON.stringify({ access_token: "access-2", expires_in: 3600 }),
        { status: 200 },
      );
    };

    const result = await refreshGoogleAccessToken("refresh-1", credentials, {
      fetch: fetchStub,
      nowMs,
    });

    expect(result).toStrictEqual({
      ok: true,
      value: { accessToken: "access-2", expiresAt: nowSeconds + 3600 },
    });
  });

  test("Google が拒否したら refreshFailed になる", async () => {
    const fetchStub: FetchLike = async () => {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
      });
    };

    const result = await refreshGoogleAccessToken("revoked", credentials, {
      fetch: fetchStub,
      nowMs,
    });

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "refreshFailed", cause: { status: 400 } },
    });
  });

  test("応答の形が違えば refreshFailed になる", async () => {
    const fetchStub: FetchLike = async () => {
      return new Response(JSON.stringify({ token: "?" }), { status: 200 });
    };

    const result = await refreshGoogleAccessToken("refresh-1", credentials, {
      fetch: fetchStub,
      nowMs,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("refreshFailed");
  });
});
