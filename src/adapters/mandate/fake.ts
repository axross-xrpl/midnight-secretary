import {
  commitPayment,
  createMandateIn,
  hasAuthorization,
  publicLedgerOf,
  validatePayment,
  type MandateIds,
  type MandateLedgerState,
} from "@/domain/mandate-ledger";
import type {
  Authorization,
  Mandate,
  MandateError,
  MandatePort,
  PaymentRequest,
  Settlement,
} from "@/domain/mandate";
import type { Result } from "@/lib/result";
import { ok } from "@/lib/result";

/**
 * Fake が作る mandate の id と commitment、送金の tx id を生成する
 *
 * いずれも非決定的なので注入する
 */
export type FakeMandateIds = MandateIds & {
  newTransactionId: () => string;
};

/**
 * Fake が最初に持つ mandate と、新しい mandate に使う id の関数
 */
export type FakeMandateSeed = {
  mandates: readonly Mandate[];
  ids: FakeMandateIds;
};

// 非公開に選ばれた支払いは shielded 送金として記録する
// tx の採番と受取先の持ち方は公開のときと同じで、変わるのは kind だけ
const settlementOf = (
  ids: FakeMandateIds,
  request: PaymentRequest,
): Settlement => {
  if (request.visibility === "private") {
    return {
      kind: "shieldedTransfer",
      transactionId: ids.newTransactionId(),
      recipient: request.recipient,
    };
  }

  return {
    kind: "tokenTransfer",
    transactionId: ids.newTransactionId(),
    recipient: request.recipient,
  };
};

// 送金は無条件で成功する (fake なので on-chain 呼び出しは無い)
const authorizePayment = (
  state: MandateLedgerState,
  ids: FakeMandateIds,
  request: PaymentRequest,
): Result<Authorization, MandateError> => {
  const validated = validatePayment(state, request);

  if (!validated.ok) {
    return validated;
  }

  const authorization: Authorization = {
    mandateId: request.mandateId,
    paymentRef: request.paymentRef,
    amount: request.amount,
    authorizedAt: request.now,
    publicHash: ids.hashAuthorization(request.mandateId, request.paymentRef),
    settlement: settlementOf(ids, request),
  };

  commitPayment(state, authorization, validated.value);

  return ok(authorization);
};

/**
 * circuit と同じ規則を適用するメモリ上の mandate で、規則は上限額、期限、payment ref ごとに 1 回の authorization
 *
 * 非公開の支払いは shielded 送金として扱えるので `privateSettlement` は true
 * `spent` がリクエストをまたいで積み上がるよう、プロセスごとに 1 回だけ作る
 */
export const createFakeMandate = (seed: FakeMandateSeed): MandatePort => {
  const state: MandateLedgerState = {
    mandates: Object.fromEntries(
      seed.mandates.map((mandate) => [mandate.id, mandate]),
    ),
    authorizations: [],
  };

  return {
    capabilities: { privateSettlement: true },
    createMandate: async (draft) => ok(createMandateIn(state, seed.ids, draft)),
    authorizePayment: async (request) =>
      authorizePayment(state, seed.ids, request),
    readMandate: async (mandateId) => ok(state.mandates[mandateId]),
    isAuthorized: async (mandateId, paymentRef) =>
      ok(hasAuthorization(state, mandateId, paymentRef)),
    readPublicLedger: async () => ok(publicLedgerOf(state)),
  };
};
