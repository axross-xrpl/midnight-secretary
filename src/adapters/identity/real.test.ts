import { describe, expect, test } from "vitest";
import type { IsoDate, IsoDateTime, UserId } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
  parseUserId,
} from "@/domain/identifiers.parse";
import type { ContractRegistration } from "@/lib/dev-contracts/age-verification";
import type { RealIdentityDeps } from "./real";
import { createRealIdentity } from "./real";

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

const BIRTH_DATE = date("2006-09-26");

const CUTOFF = date("2006-09-18");

const ACCOUNT_REF = "ref:user-1";

const IDENTITY = "identity-1";

const COMMITMENT = "commitment-1";

const CONTRACT_ADDRESS = "contract-1";

const UNREGISTERED: ContractRegistration = {
  identity: IDENTITY,
  registered: false,
  contractAddress: CONTRACT_ADDRESS,
};

const REGISTERED: ContractRegistration = {
  identity: IDENTITY,
  registered: true,
  dobCommitment: COMMITMENT,
  contractAddress: CONTRACT_ADDRESS,
};

const MIDNIGHT_REGISTRATION = {
  userId: USER,
  identity: IDENTITY,
  origin: {
    kind: "midnight",
    dobCommitment: COMMITMENT,
    contractAddress: CONTRACT_ADDRESS,
  },
};

type Calls = {
  register: readonly { accountRef: string; dateOfBirth: string }[];
  prove: readonly { accountRef: string; cutoffDate: string }[];
};

type ServerState = {
  registration: ContractRegistration;
  calls: Calls;
};

type FakeContractServer = {
  deps: RealIdentityDeps;
  state: ServerState;
};

type ProveStub = {
  isAdult: boolean;
};

// 登録すると読み取りが登録済みに変わり、証明は要求された cutoff をそのまま返す contract server の小さな Fake
// 呼び出しの記録はテストの本体で見たいので、このクロージャに閉じた入れ物へ代入する
const fakeContractServer = (
  registration: ContractRegistration,
  proved: ProveStub,
): FakeContractServer => {
  const state: ServerState = {
    registration,
    calls: { register: [], prove: [] },
  };

  return {
    state,
    deps: {
      readRegistration: async () => state.registration,
      register: async (accountRef, dateOfBirth) => {
        state.calls = {
          ...state.calls,
          register: [...state.calls.register, { accountRef, dateOfBirth }],
        };
        state.registration = REGISTERED;

        return { identity: IDENTITY, txId: "tx-register-1", blockHeight: 10 };
      },
      prove: async (accountRef, cutoffDate) => {
        state.calls = {
          ...state.calls,
          prove: [...state.calls.prove, { accountRef, cutoffDate }],
        };

        return {
          identity: IDENTITY,
          txId: "tx-prove-1",
          blockHeight: 11,
          cutoffDate,
          isAdult: proved.isAdult,
        };
      },
      accountRefOf: (id) => `ref:${id}`,
    },
  };
};

describe("readRegistration", () => {
  test("未登録なら undefined になる", async () => {
    const server = fakeContractServer(UNREGISTERED, { isAdult: true });
    const identity = createRealIdentity(server.deps);

    expect(await identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("登録済みなら Midnight に載った登録になる", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: true });
    const identity = createRealIdentity(server.deps);

    expect(await identity.readRegistration(USER)).toStrictEqual({
      ok: true,
      value: MIDNIGHT_REGISTRATION,
    });
  });

  test("登録済みなのに commitment が無ければ unavailable になる", async () => {
    const server = fakeContractServer(
      {
        identity: IDENTITY,
        registered: true,
        contractAddress: CONTRACT_ADDRESS,
      },
      { isAdult: true },
    );
    const identity = createRealIdentity(server.deps);

    const read = await identity.readRegistration(USER);

    expect(read.ok).toBe(false);
    expect(!read.ok && read.error.kind).toBe("unavailable");
  });

  test("contract server に届かなければ unavailable になる", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: true });
    const deps: RealIdentityDeps = {
      ...server.deps,
      readRegistration: async () => {
        throw new Error("fetch failed");
      },
    };
    const identity = createRealIdentity(deps);

    const read = await identity.readRegistration(USER);

    expect(read.ok).toBe(false);
    expect(!read.ok && read.error.kind).toBe("unavailable");
  });
});

describe("registerBirthDate", () => {
  test("生年月日を YYYYMMDD にして登録し、読み直した commitment とアドレスを返す", async () => {
    const server = fakeContractServer(UNREGISTERED, { isAdult: true });
    const identity = createRealIdentity(server.deps);

    expect(
      await identity.registerBirthDate(USER, BIRTH_DATE, NOW),
    ).toStrictEqual({
      ok: true,
      value: MIDNIGHT_REGISTRATION,
    });
    expect(server.state.calls.register).toStrictEqual([
      { accountRef: ACCOUNT_REF, dateOfBirth: "20060926" },
    ]);
  });

  test("登録済みなら alreadyRegistered になり、register は呼ばない", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: true });
    const identity = createRealIdentity(server.deps);

    expect(
      await identity.registerBirthDate(USER, BIRTH_DATE, NOW),
    ).toStrictEqual({
      ok: false,
      error: { kind: "alreadyRegistered", identity: IDENTITY },
    });
    expect(server.state.calls.register).toStrictEqual([]);
  });

  test("register が Identity already registered で落ちても alreadyRegistered になる", async () => {
    const server = fakeContractServer(UNREGISTERED, { isAdult: true });
    const deps: RealIdentityDeps = {
      ...server.deps,
      register: async () => {
        throw new Error("Identity already registered");
      },
    };
    const identity = createRealIdentity(deps);

    expect(
      await identity.registerBirthDate(USER, BIRTH_DATE, NOW),
    ).toStrictEqual({
      ok: false,
      error: { kind: "alreadyRegistered", identity: IDENTITY },
    });
  });

  test("register がそれ以外で落ちたら unavailable になる", async () => {
    const server = fakeContractServer(UNREGISTERED, { isAdult: true });
    const deps: RealIdentityDeps = {
      ...server.deps,
      register: async () => {
        throw new Error("proof server unreachable");
      },
    };
    const identity = createRealIdentity(deps);

    const registered = await identity.registerBirthDate(USER, BIRTH_DATE, NOW);

    expect(registered.ok).toBe(false);
    expect(!registered.ok && registered.error.kind).toBe("unavailable");
  });
});

describe("proveAdult", () => {
  test("cutoff を YYYYMMDD にして渡す", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: true });
    const identity = createRealIdentity(server.deps);

    await identity.proveAdult(USER, CUTOFF, NOW);

    expect(server.state.calls.prove).toStrictEqual([
      { accountRef: ACCOUNT_REF, cutoffDate: "20060918" },
    ]);
  });

  test("isAdult なら adult になり、証明の参照は contract server の tx id になる", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: true });
    const identity = createRealIdentity(server.deps);

    expect(await identity.proveAdult(USER, CUTOFF, NOW)).toStrictEqual({
      ok: true,
      value: {
        kind: "adult",
        proof: {
          identity: IDENTITY,
          cutoffDate: "2006-09-18",
          proofRef: "tx-prove-1",
          provedAt: NOW,
        },
      },
    });
  });

  test("isAdult でなければ notAdult になり、エラーにはならない", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: false });
    const identity = createRealIdentity(server.deps);

    expect(await identity.proveAdult(USER, CUTOFF, NOW)).toStrictEqual({
      ok: true,
      value: { kind: "notAdult", cutoffDate: "2006-09-18" },
    });
  });

  test("返ってきた cutoff が要求と食い違えば proofFailed になる", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: true });
    const deps: RealIdentityDeps = {
      ...server.deps,
      prove: async () => ({
        identity: IDENTITY,
        txId: "tx-prove-1",
        blockHeight: 11,
        cutoffDate: "20060917",
        isAdult: true,
      }),
    };
    const identity = createRealIdentity(deps);

    const proved = await identity.proveAdult(USER, CUTOFF, NOW);

    expect(proved.ok).toBe(false);
    expect(!proved.ok && proved.error.kind).toBe("proofFailed");
  });

  test("Identity not registered で落ちたら notRegistered になる", async () => {
    const server = fakeContractServer(UNREGISTERED, { isAdult: true });
    const deps: RealIdentityDeps = {
      ...server.deps,
      prove: async () => {
        throw new Error("Identity not registered");
      },
    };
    const identity = createRealIdentity(deps);

    expect(await identity.proveAdult(USER, CUTOFF, NOW)).toStrictEqual({
      ok: false,
      error: { kind: "notRegistered" },
    });
  });

  test("それ以外で落ちたら unavailable になる", async () => {
    const server = fakeContractServer(REGISTERED, { isAdult: true });
    const deps: RealIdentityDeps = {
      ...server.deps,
      prove: async () => {
        throw new Error("proof server unreachable");
      },
    };
    const identity = createRealIdentity(deps);

    const proved = await identity.proveAdult(USER, CUTOFF, NOW);

    expect(proved.ok).toBe(false);
    expect(!proved.ok && proved.error.kind).toBe("unavailable");
  });
});
