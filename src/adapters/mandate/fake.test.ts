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
import type { MandateDraft, MandatePort } from "@/domain/mandate";
import type { Money } from "@/domain/money";
import type { FakeMandateIds } from "./fake";
import { createFakeMandate } from "./fake";

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

// 連番の採番はテスト設定に閉じているので、閉じたカウンタで数える
const testIds = (): FakeMandateIds => {
  const state = { issued: 0, sent: 0 };

  return {
    newMandateId: () => {
      state.issued = state.issued + 1;

      return mandateId(`mandate-${state.issued}`);
    },
    newCommitment: () => `commitment-${state.issued}`,
    newTransactionId: () => {
      state.sent = state.sent + 1;

      return `tx-${state.sent}`;
    },
    hashAuthorization: (id, ref) => `hash:${id}:${ref}`,
  };
};

const emptyMandate = (): MandatePort => {
  return createFakeMandate({ mandates: [], ids: testIds() });
};

const draft = (cap: number, expiresAt: string): MandateDraft => {
  return { cap: mst(cap), expiresAt: at(expiresAt), purpose: "出張手配" };
};

const setUp = async (
  cap: number,
  expiresAt = "2026-12-31T23:59:59+09:00",
): Promise<MandatePort> => {
  const mandate = emptyMandate();
  const created = await mandate.createMandate(draft(cap, expiresAt));

  if (!created.ok) {
    throw new Error("test setup: createMandate failed");
  }

  return mandate;
};

describe("createMandate", () => {
  test("id と commitment を採番し、spent 0 で保存する", async () => {
    const mandate = emptyMandate();

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
    expect(await mandate.readMandate(mandateId("mandate-1"))).toStrictEqual(
      created,
    );
  });

  test("知らない mandate は undefined になる", async () => {
    const mandate = emptyMandate();

    expect(await mandate.readMandate(mandateId("mandate-9"))).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });
});

describe("authorizePayment", () => {
  test("承認すると受取先へ送金し、spent が増えて承認が記録される", async () => {
    const mandate = await setUp(50000);

    const authorized = await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
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

    const read = await mandate.readMandate(mandateId("mandate-1"));

    expect(read.ok && read.value?.spent).toStrictEqual(mst(14720));
    expect(
      await mandate.isAuthorized(mandateId("mandate-1"), paymentRef("trip:1")),
    ).toStrictEqual({ ok: true, value: true });
  });

  test("受取先は要求のものをそのまま送金先にする", async () => {
    const mandate = await setUp(50000);

    const authorized = await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(12000),
      recipient: walletAddress("demo-payee-hotels"),
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(authorized.ok && authorized.value.settlement).toStrictEqual({
      kind: "tokenTransfer",
      transactionId: "tx-1",
      recipient: "demo-payee-hotels",
    });
  });

  test("同じ paymentRef は二度目に alreadyAuthorized になる", async () => {
    const mandate = await setUp(50000);
    const request = {
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      now: at("2026-09-09T09:00:00+09:00"),
    };

    await mandate.authorizePayment(request);

    expect(await mandate.authorizePayment(request)).toStrictEqual({
      ok: false,
      error: { kind: "alreadyAuthorized", paymentRef: "trip:1" },
    });
  });

  test("上限を超えると overBudget になり spent は変わらない", async () => {
    const mandate = await setUp(20000);

    await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(
      await mandate.authorizePayment({
        mandateId: mandateId("mandate-1"),
        paymentRef: paymentRef("trip:2"),
        amount: mst(14720),
        recipient: PAYEE,
        now: at("2026-09-09T09:00:00+09:00"),
      }),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "overBudget",
        cap: mst(20000),
        spent: mst(14720),
        requested: mst(14720),
      },
    });

    const read = await mandate.readMandate(mandateId("mandate-1"));

    expect(read.ok && read.value?.spent).toStrictEqual(mst(14720));
  });

  test("上限ちょうどは通す", async () => {
    const mandate = await setUp(14720);

    const authorized = await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(authorized.ok).toBe(true);
  });

  test("期限を過ぎていれば expired になる", async () => {
    const mandate = await setUp(50000, "2026-09-01T00:00:00+09:00");

    expect(
      await mandate.authorizePayment({
        mandateId: mandateId("mandate-1"),
        paymentRef: paymentRef("trip:1"),
        amount: mst(1),
        recipient: PAYEE,
        now: at("2026-09-09T09:00:00+09:00"),
      }),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "expired",
        expiresAt: "2026-09-01T00:00:00+09:00",
        now: "2026-09-09T09:00:00+09:00",
      },
    });
  });

  test("知らない mandate は notFound になる", async () => {
    const mandate = await setUp(50000);

    expect(
      await mandate.authorizePayment({
        mandateId: mandateId("mandate-9"),
        paymentRef: paymentRef("trip:1"),
        amount: mst(1),
        recipient: PAYEE,
        now: at("2026-09-09T09:00:00+09:00"),
      }),
    ).toStrictEqual({
      ok: false,
      error: { kind: "notFound", mandateId: "mandate-9" },
    });
  });
});

describe("readPublicLedger", () => {
  test("commitment と承認のハッシュだけを載せ、金額と受取先と tx は載せない", async () => {
    const mandate = await setUp(50000);

    await mandate.authorizePayment({
      mandateId: mandateId("mandate-1"),
      paymentRef: paymentRef("trip:1"),
      amount: mst(14720),
      recipient: PAYEE,
      now: at("2026-09-09T09:00:00+09:00"),
    });

    expect(await mandate.readPublicLedger()).toStrictEqual({
      ok: true,
      value: {
        commitments: [{ mandateId: "mandate-1", commitment: "commitment-1" }],
        authorizations: [{ publicHash: "hash:mandate-1:trip:1" }],
        authorizedCount: 1,
      },
    });
  });

  test("承認が無ければ件数は 0 になる", async () => {
    const mandate = await setUp(50000);

    expect(await mandate.readPublicLedger()).toStrictEqual({
      ok: true,
      value: {
        commitments: [{ mandateId: "mandate-1", commitment: "commitment-1" }],
        authorizations: [],
        authorizedCount: 0,
      },
    });
  });
});
