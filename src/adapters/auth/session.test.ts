import { describe, expect, test } from "vitest";
import { userIdOf } from "./session";

describe("userIdOf", () => {
  test("JWT が無ければ unauthenticated になる", () => {
    expect(userIdOf(null)).toStrictEqual({
      ok: false,
      error: { kind: "unauthenticated" },
    });
  });

  test("sub が無ければ unauthenticated になる", () => {
    expect(userIdOf({})).toStrictEqual({
      ok: false,
      error: { kind: "unauthenticated" },
    });
  });

  test("sub が空文字なら unauthenticated になる", () => {
    expect(userIdOf({ sub: "" })).toStrictEqual({
      ok: false,
      error: { kind: "unauthenticated" },
    });
  });

  test("sub があればユーザ id になる", () => {
    expect(userIdOf({ sub: "dev-user" })).toStrictEqual({
      ok: true,
      value: "dev-user",
    });
  });
});
