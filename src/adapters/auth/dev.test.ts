import type { Provider } from "next-auth/providers/index";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { authOptionsFor, DEV_PROVIDER_ID, DEV_USER } from "./dev";

const google = { clientId: "client-1", clientSecret: "secret-1" };

const providerOptionsSchema = z.object({ id: z.string() });

// next-auth は組み込みプロバイダの既定値と、渡した設定 (options) を起動時にマージする
// id の決め方はライブラリと同じで、渡した設定にあればそれ、無ければ既定値
const effectiveIdOf = (provider: Provider): string => {
  const options = providerOptionsSchema.safeParse(provider.options);

  if (!options.success) {
    return provider.id;
  }

  return options.data.id;
};

const providersOf = (source: "google" | "dev") => {
  return authOptionsFor(source, google, DEV_USER).providers;
};

describe("authOptionsFor", () => {
  test("dev は dev サインインだけを出す", () => {
    expect(providersOf("dev").map(effectiveIdOf)).toStrictEqual([
      DEV_PROVIDER_ID,
    ]);
    expect(providersOf("dev").map((provider) => provider.type)).toStrictEqual([
      "credentials",
    ]);
  });

  test("google は Google のサインインだけを出す", () => {
    expect(providersOf("google").map(effectiveIdOf)).toStrictEqual(["google"]);
    expect(
      providersOf("google").map((provider) => provider.type),
    ).toStrictEqual(["oauth"]);
  });

  test("どちらもセッションは JWT で持つ", () => {
    expect(authOptionsFor("dev", google, DEV_USER).session?.strategy).toBe(
      "jwt",
    );
    expect(authOptionsFor("google", google, DEV_USER).session?.strategy).toBe(
      "jwt",
    );
  });

  test("dev サインインには Google のトークンを更新するコールバックが無い", () => {
    expect(authOptionsFor("dev", google, DEV_USER).callbacks?.jwt).toBe(
      undefined,
    );
    expect(authOptionsFor("google", google, DEV_USER).callbacks?.jwt).not.toBe(
      undefined,
    );
  });

  test("dev サインインのユーザは固定されている", () => {
    expect(DEV_USER).toStrictEqual({
      id: "dev-user",
      name: "Dev User",
      email: "dev@example.com",
    });
  });
});
