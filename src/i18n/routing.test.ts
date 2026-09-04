import { describe, expect, test } from "vitest";
import { routing } from "@/i18n/routing";

describe("routing", () => {
  test("supports English and Japanese", () => {
    expect(routing.locales).toStrictEqual(["en", "ja"]);
  });

  test("defaults to English", () => {
    expect(routing.defaultLocale).toBe("en");
  });
});
