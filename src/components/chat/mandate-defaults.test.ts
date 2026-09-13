import { describe, expect, test } from "vitest";
import { defaultMandateDraft } from "./mandate-defaults";

const PURPOSE = "出張の手配";

describe("defaultMandateDraft", () => {
  test("上限は 200,000 で、用途は渡した文言", () => {
    const draft = defaultMandateDraft("2026-09-13T00:00:00.000Z", PURPOSE);

    expect(draft.cap).toBe(200000);
    expect(draft.purpose).toBe(PURPOSE);
  });

  test("期限は now の 30 日後", () => {
    expect(
      defaultMandateDraft("2026-09-13T00:00:00.000Z", PURPOSE).expiresAt,
    ).toBe("2026-10-13T00:00:00.000Z");
  });

  test("オフセット付きの now でも 30 日後の同じ時点になる", () => {
    expect(
      defaultMandateDraft("2026-09-13T09:00:00+09:00", PURPOSE).expiresAt,
    ).toBe("2026-10-13T00:00:00.000Z");
  });
});
