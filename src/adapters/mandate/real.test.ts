import { describe, expect, test } from "vitest";
import type {
  MandateId,
  PaymentRef,
  WalletAddress,
} from "@/domain/identifiers";
import {
  mustParse,
  parseAmount,
  parseIsoDateTime,
  parseMandateId,
  parsePaymentRef,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import type { MandateIds } from "@/domain/mandate-ledger";
import type {
  MandateDraft,
  MandatePort,
  PaymentRequest,
} from "@/domain/mandate";
import type { Money } from "@/domain/money";
import type { RealMandateDeps } from "./real";
import { createRealMandate } from "./real";

const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

const mandateId = (raw: string): MandateId => {
  return mustParse(parseMandateId(raw));
};

const paymentRef = (raw: string): PaymentRef => {
  return mustParse(parsePaymentRef(raw));
};

const at = (raw: string) => {
  return mustParse(parseIsoDateTime(raw));
};

const walletAddress = (raw: string): WalletAddress => {
  return mustParse(parseWalletAddress(raw));
};

const PAYEE = walletAddress("demo-payee-jr");

const testIds = (): MandateIds => {
  const state = { issued: 0 };

  return {
    newMandateId: () => {
      state.issued = state.issued + 1;

      return mandateId(`mandate-${state.issued}`);
    },
    newCommitment: () => `commitment-${state.issued}`,
    hashAuthorization: (id, ref) => `hash:${id}:${ref}`,
  };
};

// 実際の on-chain 送金は行わず、渡された引数を記録するだけの deps
const recordingDeps = (): RealMandateDeps & {
  calls: { recipient: string; amount: string }[];
} => {
  const calls: { recipient: string; amount: string }[] = [];
  let sent = 0;

  return {
    calls,
    payToken: async (recipient, amount) => {
      calls.push({ recipient, amount });
      sent = sent + 1;

      return { txId: `tx-${sent}` };
    },
    settlementRecipient: () => "mn_addr_undeployed1demo-settlement",
  };
};

const emptyMandate = (deps: RealMandateDeps = recordingDeps()): MandatePort => {
  return createRealMandate({ mandates: [], ids: testIds(), deps });
};

const draft = (cap: number, expiresAt: string): MandateDraft => {
  return { cap: mst(cap), expiresAt: at(expiresAt), purpose: "出張手配" };
};

const setUp = async (
  deps: RealMandateDeps,
  cap: number,
  expiresAt = "2026-12-31T23:59:59+09:00",
): Promise<MandatePort> => {
  const mandate = emptyMandate(deps);
  const created = await mandate.createMandate(draft(cap, expiresAt));

  if (!created.ok) {
    throw new Error("test setup: createMandate failed");
  }

  return mandate;
};

describe("createMandate", () => {
  test("id と commitment を採番し、spent 0 で保存する (on-chain 呼び出しは無い)", async () => {
    const deps = recordingDeps();
    const mandate = emptyMandate(deps);

    const created = await mandate.createMandate(
      draft(50000, "2026-12-31T23:59:59+09:00"),
    );

    expect(created).toStrictEqual({
      ok: true,
      value: {
        id: "mandate-1",
        cap: mst(50000),
        spent: mst(0),
        expiresAt: "2026-12-31T23:59:59+09:00",
        purpose: "出張手配",
        commitment: "commitment-1",
      },
    });
    expect(deps.calls).toStrictEqual([]);
  });
});

describe("authorizePayment", () => {
  test("承認すると固定の決済受取アドレスへ実際に送金し、tx id が settlement に載る", async () => {
    const deps = recordingDeps();
    const mandate = await setUp(deps, 50000);

    const authorized = await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      visibility: "public",
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(authorized).toStrictEqual({
      ok: true,
      value: {
        mandateId: "mandate-1",
        paymentRef: "trip:1",
        amount: mst(14720),
        authorizedAt: "2026-09-09T09:00:00+09:00",
        publicHash: "hash:mandate-1:trip:1",
        settlement: {
          kind: "tokenTransfer",
          transactionId: "tx-1",
          recipient: PAYEE,
        },
      },
    });
    // カタログの payee (プレースホルダ) ではなく、固定の決済受取アドレスへ送金する
    expect(deps.calls).toStrictEqual([
      { recipient: "mn_addr_undeployed1demo-settlement", amount: "14720" },
    ]);

    const read = await mandate.readMandate(mandateId("mandate-1"));
    expect(read.ok && read.value?.spent).toStrictEqual(mst(14720));
  });

  test("上限を超えると overBudget になり、on-chain 送金は試みない", async () => {
    const deps = recordingDeps();
    const mandate = await setUp(deps, 10000);

    const authorized = await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      visibility: "public",
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(authorized).toStrictEqual({
      ok: false,
      error: {
        kind: "overBudget",
        cap: mst(10000),
        spent: mst(0),
        requested: mst(14720),
      },
    });
    expect(deps.calls).toStrictEqual([]);
  });

  test("同じ paymentRef は二度目に alreadyAuthorized になり、送金は一度きり", async () => {
    const deps = recordingDeps();
    const mandate = await setUp(deps, 50000);
    const request: PaymentRequest = {
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      visibility: "public",
      now: at("2026-09-09T09:00:00+09:00"),
    };

    await mandate.authorizePayment(request);

    expect(await mandate.authorizePayment(request)).toStrictEqual({
      ok: false,
      error: { kind: "alreadyAuthorized", paymentRef: "trip:1" },
    });
    expect(deps.calls).toHaveLength(1);
  });

  test("送金が失敗すると unavailable になり、spent は変わらない", async () => {
    const deps: RealMandateDeps = {
      payToken: async () => {
        throw new Error("proof server unreachable");
      },
      settlementRecipient: () => "mn_addr_undeployed1demo-settlement",
    };
    const mandate = await setUp(deps, 50000);

    const authorized = await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      visibility: "public",
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(authorized.ok).toBe(false);
    expect(!authorized.ok && authorized.error.kind).toBe("unavailable");

    const read = await mandate.readMandate(mandateId("mandate-1"));
    expect(read.ok && read.value?.spent).toStrictEqual(mst(0));
  });

  test("MANDATE_SETTLEMENT_RECIPIENT が未設定なら unavailable になり、送金は試みない", async () => {
    let called = false;
    const deps: RealMandateDeps = {
      payToken: async () => {
        called = true;
        return { txId: "tx-1" };
      },
      settlementRecipient: () => undefined,
    };
    const mandate = await setUp(deps, 50000);

    const authorized = await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      visibility: "public",
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(authorized.ok).toBe(false);
    expect(!authorized.ok && authorized.error.kind).toBe("unavailable");
    expect(called).toBe(false);
  });

  test("知らない mandate は notFound になり、送金は試みない", async () => {
    const deps = recordingDeps();
    const mandate = await setUp(deps, 50000);

    expect(
      await mandate.authorizePayment({
        mandateId: mandateId("mandate-9"),
        paymentRef: paymentRef("trip:1"),
        amount: mst(1),
        recipient: PAYEE,
        visibility: "public",
        now: at("2026-09-09T09:00:00+09:00"),
      }),
    ).toStrictEqual({
      ok: false,
      error: { kind: "notFound", mandateId: "mandate-9" },
    });
    expect(deps.calls).toStrictEqual([]);
  });
});
