import { describe, expect, test } from "vitest";
import { completeWithEnglish, diffCatalogs, flattenMessages } from "./messages";

describe("flattenMessages", () => {
  test("入れ子のメッセージを定義順のドットパスにする", () => {
    expect(
      flattenMessages({
        NavBar: { home: "Home", dashboard: "Dashboard" },
        Top: "x",
      }),
    ).toStrictEqual({
      "NavBar.home": "Home",
      "NavBar.dashboard": "Dashboard",
      Top: "x",
    });
  });

  test("深い入れ子も辿る", () => {
    expect(flattenMessages({ A: { b: { c: "x" } } })).toStrictEqual({
      "A.b.c": "x",
    });
  });

  test("空のメッセージは空のカタログになる", () => {
    expect(flattenMessages({})).toStrictEqual({});
  });
});

describe("completeWithEnglish", () => {
  test("日本語に文言があればそれを使う", () => {
    expect(
      completeWithEnglish(
        { NavBar: { home: "ホーム" } },
        { NavBar: { home: "Home" } },
      ),
    ).toStrictEqual({ NavBar: { home: "ホーム" } });
  });

  test("日本語に無いキーは英語の文言で補完する", () => {
    expect(
      completeWithEnglish(
        { NavBar: { home: "ホーム" } },
        { NavBar: { home: "Home", dashboard: "Dashboard" } },
      ),
    ).toStrictEqual({ NavBar: { home: "ホーム", dashboard: "Dashboard" } });
  });

  test("日本語に名前空間ごと無くても英語の形で作る", () => {
    expect(
      completeWithEnglish({}, { Auth: { signIn: "Sign in" } }),
    ).toStrictEqual({ Auth: { signIn: "Sign in" } });
  });

  test("入れ子の名前空間も同じ規則で補完する", () => {
    expect(
      completeWithEnglish(
        { Auth: { errors: { expired: "期限切れ" } } },
        { Auth: { signIn: "Sign in", errors: { expired: "Expired" } } },
      ),
    ).toStrictEqual({
      Auth: { signIn: "Sign in", errors: { expired: "期限切れ" } },
    });
  });

  test("英語に無い日本語のキーは捨てる", () => {
    expect(
      completeWithEnglish(
        { NavBar: { home: "ホーム", hom: "typo" }, Extra: { only: "ja" } },
        { NavBar: { home: "Home" } },
      ),
    ).toStrictEqual({ NavBar: { home: "ホーム" } });
  });

  test("英語が文言で日本語が入れ子のキーは英語を使う", () => {
    expect(
      completeWithEnglish({ A: { x: { deep: "tree" } } }, { A: { x: "leaf" } }),
    ).toStrictEqual({ A: { x: "leaf" } });
  });

  test("入力を変更しない", () => {
    const japanese = { NavBar: { home: "ホーム" } };
    const english = { NavBar: { home: "Home", dashboard: "Dashboard" } };
    const japaneseSnapshot = structuredClone(japanese);
    const englishSnapshot = structuredClone(english);

    completeWithEnglish(japanese, english);

    expect(japanese).toStrictEqual(japaneseSnapshot);
    expect(english).toStrictEqual(englishSnapshot);
  });
});

describe("diffCatalogs", () => {
  test("英語にあって日本語に無いキーを missing に報告する", () => {
    expect(
      diffCatalogs(
        { "NavBar.home": "Home", "NavBar.dashboard": "Dashboard" },
        { "NavBar.home": "ホーム" },
      ),
    ).toStrictEqual({ missing: ["NavBar.dashboard"], extra: [] });
  });

  test("日本語にだけあるキーを extra に報告する", () => {
    expect(
      diffCatalogs(
        { "NavBar.home": "Home" },
        { "NavBar.home": "ホーム", "NavBar.hom": "typo" },
      ),
    ).toStrictEqual({ missing: [], extra: ["NavBar.hom"] });
  });

  test("同じキー集合なら missing と extra は空になる", () => {
    const catalog = { "A.b": "x", C: "y" };

    expect(diffCatalogs(catalog, catalog)).toStrictEqual({
      missing: [],
      extra: [],
    });
  });
});
