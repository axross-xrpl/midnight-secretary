import {
  commitPayment,
  createMandateIn,
  hasAuthorization,
  publicLedgerOf,
  releaseIn,
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
import { err, fromPromise, ok } from "@/lib/result";

/**
 * real が実際のトークン送金に使うもの
 *
 * 本番は `@/lib/dev-contracts/token`/`shielded-token` の `payToken`/`payShieldedToken`
 * (contract-server 経由で `sendToken`/`mint_and_send` を呼ぶ) を渡す
 */
export type RealMandateDeps = {
  payToken: (
    recipientUnshieldedAddress: string,
    amount: string,
  ) => Promise<{ txId: string }>;
  // MANDATE_SETTLEMENT_RECIPIENT を読む。未設定なら undefined
  settlementRecipient: () => string | undefined;
  payShieldedToken: (
    recipientShieldedAddressOrCoinPublicKey: string,
    amount: string,
  ) => Promise<{ txId: string }>;
  // MANDATE_SETTLEMENT_RECIPIENT_SHIELDED を読む。未設定なら undefined
  shieldedSettlementRecipient: () => string | undefined;
};

/**
 * real が最初に持つ mandate と、id の生成関数、実際の送金の依存
 *
 * カタログの payee (`transport_services`/`place_services` の wallet_address) はまだ
 * 本物の Midnight アドレスではないプレースホルダ文字列 (`mn_shield-addr_test1demo-...`) なので、
 * `sendToken`/`mint_and_send` の送り先には使えない。カタログが本物のアドレスを持つようになるまでの暫定として、
 * すべての real な支払いは `MANDATE_SETTLEMENT_RECIPIENT`/`_SHIELDED` の固定デモ受取アドレスへ送る。
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

const shieldedSettlementRecipientOf = (
  deps: RealMandateDeps,
): Result<string, MandateError> => {
  const value = deps.shieldedSettlementRecipient();

  if (!value) {
    return err({
      kind: "unavailable",
      cause: new Error(
        "MANDATE_SETTLEMENT_RECIPIENT_SHIELDED is not configured (see .env.example)",
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

const sendShieldedOnChain = async (
  deps: RealMandateDeps,
  recipient: string,
  amount: number,
): Promise<Result<{ txId: string }, MandateError>> => {
  return fromPromise(
    deps.payShieldedToken(recipient, amount.toString()),
    (cause) => ({ kind: "unavailable", cause }),
  );
};

const finalizeAuthorization = (
  state: MandateLedgerState,
  ids: MandateIds,
  mandate: Mandate,
  request: PaymentRequest,
  settlement: Settlement,
): Authorization => {
  const authorization: Authorization = {
    mandateId: request.mandateId,
    paymentRef: request.paymentRef,
    amount: request.amount,
    authorizedAt: request.now,
    publicHash: ids.hashAuthorization(request.mandateId, request.paymentRef),
    settlement,
    escrow: { status: "held", heldAt: request.now },
  };

  commitPayment(state, authorization, mandate);

  return authorization;
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

  if (request.visibility === "private") {
    const recipient = shieldedSettlementRecipientOf(deps);

    if (!recipient.ok) {
      return recipient;
    }

    const sent = await sendShieldedOnChain(
      deps,
      recipient.value,
      request.amount.amount,
    );

    if (!sent.ok) {
      return sent;
    }

    return ok(
      finalizeAuthorization(state, ids, validated.value, request, {
        kind: "shieldedTransfer",
        transactionId: sent.value.txId,
        recipient: request.recipient,
      }),
    );
  }

  const recipient = settlementRecipientOf(deps);

  if (!recipient.ok) {
    return recipient;
  }

  const sent = await sendOnChain(deps, recipient.value, request.amount.amount);

  if (!sent.ok) {
    return sent;
  }

  return ok(
    finalizeAuthorization(state, ids, validated.value, request, {
      kind: "tokenTransfer",
      transactionId: sent.value.txId,
      recipient: request.recipient,
    }),
  );
};

/**
 * `contract/src/token.compact` の `sendToken` と `shielded-token.compact` の
 * `mint_and_send` に裏打ちされた mandate
 *
 * mandate 自体の上限・使用済み・期限・commitment はプロセスのメモリ上でのみ管理する
 * (token.compact / shielded-token.compact に mandate という概念が無いため) 。fake との違いは
 * `authorizePayment` が実際に on-chain のトークン送金を行う一点のみ
 * `visibility: "private"` は shielded (`mint_and_send`)、`"public"` は unshielded (`sendToken`) を使う。
 * `privateSettlement` は `MANDATE_SETTLEMENT_RECIPIENT_SHIELDED` が設定されているときだけ true
 * (adapter を作った時点で決まる -- `MandateCapabilities` の規約どおり)
 * 預かり (`escrow`) は Wave 2 ではメモリ上の状態で、`releaseEscrow` は on-chain 呼び出しをしない (Wave 3 で契約に移す)
 */
export const createRealMandate = (seed: RealMandateSeed): MandatePort => {
  const state: MandateLedgerState = {
    mandates: Object.fromEntries(
      seed.mandates.map((mandate) => [mandate.id, mandate]),
    ),
    authorizations: [],
  };
  const privateSettlement =
    seed.deps.shieldedSettlementRecipient() !== undefined;

  return {
    capabilities: { privateSettlement },
    createMandate: async (draft) => ok(createMandateIn(state, seed.ids, draft)),
    authorizePayment: (request) =>
      authorizePayment(state, seed.ids, seed.deps, request),
    // Wave 2 は承認時に送金済みなので、解放はメモリ上の状態を進めるだけ (fake と同じ)
    releaseEscrow: async (mandateId, paymentRef, now) =>
      releaseIn(state, seed.ids, mandateId, paymentRef, now),
    readMandate: async (mandateId) => ok(state.mandates[mandateId]),
    isAuthorized: async (mandateId, paymentRef) =>
      ok(hasAuthorization(state, mandateId, paymentRef)),
    readPublicLedger: async () => ok(publicLedgerOf(state)),
  };
};
