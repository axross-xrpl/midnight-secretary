import type { MandateId, PaymentRef } from "@/domain/identifiers";
import { mustParse, parseAmount } from "@/domain/identifiers.parse";
import type {
  Authorization,
  Mandate,
  MandateDraft,
  MandateError,
  MandatePort,
  PaymentRequest,
  PublicLedgerView,
} from "@/domain/mandate";
import type { Money } from "@/domain/money";
import { addMoney, compareMoney } from "@/domain/money";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

/**
 * Fake が作る mandate の id と commitment、送金の tx id を生成する
 *
 * いずれも非決定的なので注入する
 */
export type FakeMandateIds = {
  newMandateId: () => MandateId;
  newCommitment: () => string;
  newTransactionId: () => string;
  hashAuthorization: (mandateId: MandateId, paymentRef: string) => string;
};

/**
 * Fake が最初に持つ mandate と、新しい mandate に使う id の関数
 */
export type FakeMandateSeed = {
  mandates: readonly Mandate[];
  ids: FakeMandateIds;
};

type FakeMandateState = {
  mandates: Readonly<Record<MandateId, Mandate>>;
  authorizations: readonly Authorization[];
};

// 受理された支払い 1 件が変えるもので、公開する authorization と新しい `spent` を持つ mandate
type AcceptedPayment = {
  authorization: Authorization;
  mandate: Mandate;
};

const zeroLike = (money: Money): Money => {
  return { amount: mustParse(parseAmount(0)), currency: money.currency };
};

const hasAuthorization = (
  state: FakeMandateState,
  mandateId: MandateId,
  paymentRef: PaymentRef,
): boolean => {
  return state.authorizations.some(
    (authorization) =>
      authorization.mandateId === mandateId &&
      authorization.paymentRef === paymentRef,
  );
};

// mandate と authorization はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const recordMandate = (state: FakeMandateState, mandate: Mandate): void => {
  state.mandates = { ...state.mandates, [mandate.id]: mandate };
};

const decidePayment = (
  state: FakeMandateState,
  ids: FakeMandateIds,
  request: PaymentRequest,
): Result<AcceptedPayment, MandateError> => {
  const mandate = state.mandates[request.mandateId];

  if (mandate === undefined) {
    return err({ kind: "notFound", mandateId: request.mandateId });
  }

  if (Date.parse(request.now) >= Date.parse(mandate.expiresAt)) {
    return err({
      kind: "expired",
      expiresAt: mandate.expiresAt,
      now: request.now,
    });
  }

  if (hasAuthorization(state, request.mandateId, request.paymentRef)) {
    return err({ kind: "alreadyAuthorized", paymentRef: request.paymentRef });
  }

  const spent = addMoney(mandate.spent, request.amount);

  if (!spent.ok) {
    return err({ kind: "unavailable", cause: spent.error });
  }

  const compared = compareMoney(spent.value, mandate.cap);

  if (!compared.ok) {
    return err({ kind: "unavailable", cause: compared.error });
  }

  if (compared.value === 1) {
    return err({
      kind: "overBudget",
      cap: mandate.cap,
      spent: mandate.spent,
      requested: request.amount,
    });
  }

  return ok({
    authorization: {
      mandateId: mandate.id,
      paymentRef: request.paymentRef,
      amount: request.amount,
      authorizedAt: request.now,
      publicHash: ids.hashAuthorization(mandate.id, request.paymentRef),
      settlement: {
        kind: "tokenTransfer",
        transactionId: ids.newTransactionId(),
        recipient: request.recipient,
      },
    },
    mandate: { ...mandate, spent: spent.value },
  });
};

const authorizePayment = (
  state: FakeMandateState,
  ids: FakeMandateIds,
  request: PaymentRequest,
): Result<Authorization, MandateError> => {
  const accepted = decidePayment(state, ids, request);

  if (!accepted.ok) {
    return accepted;
  }

  recordMandate(state, accepted.value.mandate);
  state.authorizations = [
    ...state.authorizations,
    accepted.value.authorization,
  ];

  return ok(accepted.value.authorization);
};

const createMandate = (
  state: FakeMandateState,
  ids: FakeMandateIds,
  draft: MandateDraft,
): Mandate => {
  const mandate: Mandate = {
    ...draft,
    id: ids.newMandateId(),
    spent: zeroLike(draft.cap),
    commitment: ids.newCommitment(),
  };

  recordMandate(state, mandate);

  return mandate;
};

// 公開するのは commitment とハッシュだけ
// 上限額、金額、身元は private な状態に留める
// 送金の受取先と tx id も authorization には持つが、ここには載せない
const publicLedgerOf = (state: FakeMandateState): PublicLedgerView => {
  return {
    commitments: Object.values(state.mandates).map((mandate) => ({
      mandateId: mandate.id,
      commitment: mandate.commitment,
    })),
    authorizations: state.authorizations.map((authorization) => ({
      publicHash: authorization.publicHash,
    })),
    authorizedCount: state.authorizations.length,
  };
};

/**
 * circuit と同じ規則を適用するメモリ上の mandate で、規則は上限額、期限、payment ref ごとに 1 回の authorization
 *
 * `spent` がリクエストをまたいで積み上がるよう、プロセスごとに 1 回だけ作る
 */
export const createFakeMandate = (seed: FakeMandateSeed): MandatePort => {
  const state: FakeMandateState = {
    mandates: Object.fromEntries(
      seed.mandates.map((mandate) => [mandate.id, mandate]),
    ),
    authorizations: [],
  };

  return {
    createMandate: async (draft) => ok(createMandate(state, seed.ids, draft)),
    authorizePayment: async (request) =>
      authorizePayment(state, seed.ids, request),
    readMandate: async (mandateId) => ok(state.mandates[mandateId]),
    isAuthorized: async (mandateId, paymentRef) =>
      ok(hasAuthorization(state, mandateId, paymentRef)),
    readPublicLedger: async () => ok(publicLedgerOf(state)),
  };
};
