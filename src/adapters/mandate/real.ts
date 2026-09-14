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
} from "@/domain/mandate";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";

/**
 * real が実際のトークン送金に使うもの
 *
 * 本番は `@/lib/dev-contracts/token` の `payToken` (contract-server 経由で `sendToken` を呼ぶ) を渡す
 */
export type RealMandateDeps = {
  payToken: (
    recipientUnshieldedAddress: string,
    amount: string,
  ) => Promise<{ txId: string }>;
  // MANDATE_SETTLEMENT_RECIPIENT を読む。未設定なら undefined
  settlementRecipient: () => string | undefined;
};

/**
 * real が最初に持つ mandate と、id の生成関数、実際の送金の依存
 *
 * カタログの payee (`transport_services`/`place_services` の wallet_address) はまだ
 * 本物の Midnight アドレスではないプレースホルダ文字列 (`mn_shield-addr_test1demo-...`) なので、
 * `sendToken` の送り先には使えない。カタログが本物のアドレスを持つようになるまでの暫定として、
 * すべての real な支払いは `MANDATE_SETTLEMENT_RECIPIENT` の固定デモ受取アドレスへ送る。
 * `Authorization.settlement.recipient` にはリクエストの payee (カタログの値) をそのまま記録し、
 * 実際の on-chain 送金先とは意図的に区別している。
 */
export type RealMandateSeed = {
  mandates: readonly Mandate[];
  ids: MandateIds;
  deps: RealMandateDeps;
};

// 起動時ではなく実際に支払うときに読む (fake/デモ運用ではこの変数が無くても壊れないように)
const settlementRecipientOf = (
  deps: RealMandateDeps,
): Result<string, MandateError> => {
  const value = deps.settlementRecipient();

  if (!value) {
    return err({
      kind: "unavailable",
      cause: new Error(
        "MANDATE_SETTLEMENT_RECIPIENT is not configured (see .env.example)",
      ),
    });
  }

  return ok(value);
};

const sendOnChain = async (
  deps: RealMandateDeps,
  recipient: string,
  amount: number,
): Promise<Result<{ txId: string }, MandateError>> => {
  return fromPromise(deps.payToken(recipient, amount.toString()), (cause) => ({
    kind: "unavailable",
    cause,
  }));
};

const authorizePayment = async (
  state: MandateLedgerState,
  ids: MandateIds,
  deps: RealMandateDeps,
  request: PaymentRequest,
): Promise<Result<Authorization, MandateError>> => {
  const validated = validatePayment(state, request);

  if (!validated.ok) {
    return validated;
  }

  const recipient = settlementRecipientOf(deps);

  if (!recipient.ok) {
    return recipient;
  }

  const sent = await sendOnChain(deps, recipient.value, request.amount.amount);

  if (!sent.ok) {
    return sent;
  }

  const authorization: Authorization = {
    mandateId: request.mandateId,
    paymentRef: request.paymentRef,
    amount: request.amount,
    authorizedAt: request.now,
    publicHash: ids.hashAuthorization(request.mandateId, request.paymentRef),
    settlement: {
      kind: "tokenTransfer",
      transactionId: sent.value.txId,
      recipient: request.recipient,
    },
  };

  commitPayment(state, authorization, validated.value);

  return ok(authorization);
};

/**
 * `contract/src/token.compact` の `sendToken` に裏打ちされた mandate
 *
 * mandate 自体の上限・使用済み・期限・commitment はプロセスのメモリ上でのみ管理する
 * (token.compact に mandate という概念が無いため) 。fake との違いは
 * `authorizePayment` が実際に on-chain のトークン送金を行う一点のみ
 * 送金は unshielded (`sendToken`) だけなので `privateSettlement` は false で、契約サーバが shielded 送金を持ったら true にする
 */
export const createRealMandate = (seed: RealMandateSeed): MandatePort => {
  const state: MandateLedgerState = {
    mandates: Object.fromEntries(
      seed.mandates.map((mandate) => [mandate.id, mandate]),
    ),
    authorizations: [],
  };

  return {
    capabilities: { privateSettlement: false },
    createMandate: async (draft) => ok(createMandateIn(state, seed.ids, draft)),
    authorizePayment: (request) =>
      authorizePayment(state, seed.ids, seed.deps, request),
    readMandate: async (mandateId) => ok(state.mandates[mandateId]),
    isAuthorized: async (mandateId, paymentRef) =>
      ok(hasAuthorization(state, mandateId, paymentRef)),
    readPublicLedger: async () => ok(publicLedgerOf(state)),
  };
};
