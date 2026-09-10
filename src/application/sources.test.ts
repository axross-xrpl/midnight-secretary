import { describe, expect, test } from "vitest";
import {
  activeFakes,
  DEMO_SOURCES,
  parsePortSources,
  REAL_SOURCES,
} from "./sources";

// dev サインインは localhost でしか通らないので、demo のケースでは常に渡す
const localhost = { NEXTAUTH_URL: "http://localhost:3000" };

describe("parsePortSources", () => {
  test("何も設定されていなければ全て real になる", () => {
    expect(parsePortSources({})).toStrictEqual({
      ok: true,
      value: REAL_SOURCES,
    });
  });

  test("SECRETARY_MODE=demo は全て fake と dev サインインになる", () => {
    expect(
      parsePortSources({ SECRETARY_MODE: "demo", ...localhost }),
    ).toStrictEqual({ ok: true, value: DEMO_SOURCES });
  });

  test("個別の変数はプリセットに勝つ", () => {
    expect(
      parsePortSources({
        SECRETARY_MODE: "demo",
        SECRETARY_STORE: "real",
        ...localhost,
      }),
    ).toStrictEqual({ ok: true, value: { ...DEMO_SOURCES, store: "real" } });
  });

  test("プリセット無しでも port 単位で fake にできる", () => {
    expect(parsePortSources({ SECRETARY_CATALOG: "fake" })).toStrictEqual({
      ok: true,
      value: { ...REAL_SOURCES, catalog: "fake" },
    });
  });

  test("port の不正な値はキーと許される値つきで invalidValue になる", () => {
    expect(parsePortSources({ SECRETARY_CALENDAR: "stub" })).toStrictEqual({
      ok: false,
      error: {
        kind: "invalidValue",
        key: "SECRETARY_CALENDAR",
        value: "stub",
        allowed: ["real", "fake"],
      },
    });
  });

  test("モードの不正な値も invalidValue になる", () => {
    expect(parsePortSources({ SECRETARY_MODE: "production" })).toStrictEqual({
      ok: false,
      error: {
        kind: "invalidValue",
        key: "SECRETARY_MODE",
        value: "production",
        allowed: ["normal", "demo"],
      },
    });
  });

  test("dev サインインで calendar=real は拒否する", () => {
    expect(
      parsePortSources({
        SECRETARY_AUTH: "dev",
        SECRETARY_CALENDAR: "real",
        ...localhost,
      }),
    ).toStrictEqual({
      ok: false,
      error: { kind: "realCalendarNeedsGoogleAuth" },
    });
  });

  test("dev サインインは localhost の NEXTAUTH_URL でだけ通る", () => {
    expect(
      parsePortSources({
        SECRETARY_MODE: "demo",
        NEXTAUTH_URL: "http://localhost:3000",
      }),
    ).toStrictEqual({ ok: true, value: DEMO_SOURCES });
    expect(
      parsePortSources({
        SECRETARY_MODE: "demo",
        NEXTAUTH_URL: "http://127.0.0.1:3000",
      }),
    ).toStrictEqual({ ok: true, value: DEMO_SOURCES });
    expect(
      parsePortSources({
        SECRETARY_MODE: "demo",
        NEXTAUTH_URL: "http://[::1]:3000",
      }),
    ).toStrictEqual({ ok: true, value: DEMO_SOURCES });
  });

  test("dev サインインで公開ホストの NEXTAUTH_URL は拒否する", () => {
    expect(
      parsePortSources({
        SECRETARY_MODE: "demo",
        NEXTAUTH_URL: "https://example.com",
      }),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "devAuthRequiresLocalhost",
        nextAuthUrl: "https://example.com",
      },
    });
  });

  test("dev サインインで NEXTAUTH_URL が未設定なら拒否する", () => {
    expect(parsePortSources({ SECRETARY_MODE: "demo" })).toStrictEqual({
      ok: false,
      error: { kind: "devAuthRequiresLocalhost", nextAuthUrl: "" },
    });
  });

  test("google サインインなら NEXTAUTH_URL は見ない", () => {
    expect(
      parsePortSources({ NEXTAUTH_URL: "https://example.com" }),
    ).toStrictEqual({ ok: true, value: REAL_SOURCES });
  });
});

describe("activeFakes", () => {
  test("fake の port を PORT_NAMES の順で返す", () => {
    expect(
      activeFakes({ ...REAL_SOURCES, store: "fake", calendar: "fake" }),
    ).toStrictEqual(["calendar", "store"]);
  });

  test("全て real なら空になる", () => {
    expect(activeFakes(REAL_SOURCES)).toStrictEqual([]);
  });

  test("demo は全ての port を挙げる", () => {
    expect(activeFakes(DEMO_SOURCES)).toStrictEqual([
      "calendar",
      "catalog",
      "planner",
      "mandate",
      "store",
    ]);
  });
});
