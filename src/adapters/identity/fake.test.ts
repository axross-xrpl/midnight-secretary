import { describe, expect, test } from "vitest";
import type { IsoDate, IsoDateTime, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
  parseUserId,
} from "@/domain/identifiers.parse";
import type { IdentityPort } from "@/domain/identity";
import type { FakeIdentityIds } from "./fake";
import { createFakeIdentity } from "./fake";

const date = (raw: string): IsoDate => {
  return mustParse(parseIsoDate(raw));
};

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const userId = (raw: string): UserId => {
  return mustParse(parseUserId(raw));
};

const USER = userId("user-1");

const NOW = at("2026-09-09T09:00:00+09:00");

const LATER = at("2026-09-10T09:00:00+09:00");

const BIRTH_DATE = date("2006-09-16");

// 採番はテスト設定に閉じているので、identity はユーザ id から、証明の参照は閉じたカウンタで作る
const testIds = (): FakeIdentityIds => {
  const state = { proved: 0 };

  return {
    identityOf: (id) => `identity:${id}`,
    newProofRef: () => {
      state.proved = state.proved + 1;

      return `proof-${state.proved}`;
    },
  };
};

const emptyIdentity = (): IdentityPort => {
  return createFakeIdentity({ ids: testIds() });
};

const registered = async (): Promise<IdentityPort> => {
  const identity = emptyIdentity();
  const created = await identity.registerBirthDate(USER, BIRTH_DATE, NOW);

  if (!created.ok) {
    throw new Error("test setup: registerBirthDate failed");
  }

  return identity;
};

describe("registerBirthDate", () => {
  test("1 回目は identity を採番して登録する", async () => {
    const identity = emptyIdentity();

    const created = await identity.registerBirthDate(USER, BIRTH_DATE, NOW);

    expect(created).toStrictEqual({
      ok: true,
      value: {
        userId: "user-1",
        identity: "identity:user-1",
        origin: { kind: "memory", registeredAt: NOW },
      },
    });
    expect(await identity.readRegistration(USER)).toStrictEqual(created);
  });

  test("2 回目は alreadyRegistered になり、登録は変わらない", async () => {
    const identity = await registered();

    expect(
      await identity.registerBirthDate(USER, date("2000-01-01"), LATER),
    ).toStrictEqual({
      ok: false,
      error: { kind: "alreadyRegistered", identity: "identity:user-1" },
    });
    expect(await identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: {
        userId: "user-1",
        identity: "identity:user-1",
        origin: { kind: "memory", registeredAt: NOW },
      },
    });
  });

  test("登録の前は readRegistration が undefined になる", async () => {
    const identity = emptyIdentity();

    expect(await identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });
});

describe("proveAdult", () => {
  test("未登録なら notRegistered になる", async () => {
    const identity = emptyIdentity();

    expect(
      await identity.proveAdult(USER, date("2006-09-16"), NOW),
    ).toStrictEqual({
      ok: false,
      error: { kind: "notRegistered" },
    });
  });

  test("生年月日が cutoff と同じ日なら adult で、証明に参照と時刻が入る", async () => {
    const identity = await registered();

    expect(
      await identity.proveAdult(USER, date("2006-09-16"), LATER),
    ).toStrictEqual({
      ok: true,
      value: {
        kind: "adult",
        proof: {
          identity: "identity:user-1",
          cutoffDate: "2006-09-16",
          proofRef: "proof-1",
          provedAt: LATER,
        },
      },
    });
  });

  test("生年月日が cutoff より前でも adult になる", async () => {
    const identity = await registered();
    const outcome = await identity.proveAdult(USER, date("2010-01-01"), LATER);

    expect(outcome.ok && outcome.value.kind).toBe("adult");
  });

  test("生年月日が cutoff の翌日なら notAdult になる", async () => {
    const identity = await registered();

    expect(
      await identity.proveAdult(USER, date("2006-09-15"), LATER),
    ).toStrictEqual({
      ok: true,
      value: { kind: "notAdult", cutoffDate: "2006-09-15" },
    });
  });

  test("証明の参照は証明ごとに採番する", async () => {
    const identity = await registered();

    await identity.proveAdult(USER, date("2006-09-16"), LATER);

    const second = await identity.proveAdult(USER, date("2006-09-17"), LATER);

    expect(
      second.ok && second.value.kind === "adult" && second.value.proof,
    ).toStrictEqual({
      identity: "identity:user-1",
      cutoffDate: "2006-09-17",
      proofRef: "proof-2",
      provedAt: LATER,
    });
  });
});
