import type { IsoDateTime, MandateId, PaymentRef } from "./identifiers";
import { mustParse, parseAmount } from "./identifiers.parse";
import type {
  Authorization,
  Mandate,
  MandateDraft,
  MandateError,
  PaymentRequest,
  PublicLedgerView,
} from "./mandate";
import type { Money } from "./money";
import { addMoney, compareMoney } from "./money";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

/**
 * `MandatePort` の実装が非決定的な値を注入するための入力
 *
 * fake と real の両方で、mandate/commitment/authorization の id 生成と解放の参照の採番に使う
 * (`token.compact` に mandate という概念自体が無いので、real でもここは on-chain ではない)
 */
export type MandateIds = {
  newMandateId: () => MandateId;
  newCommitment: () => string;
  hashAuthorization: (mandateId: MandateId, paymentRef: string) => string;
  newReleaseRef: () => string;
};

/**
 * mandate と authorization の全件を持つ、プロセスの寿命だけのメモリ上の台帳
 *
 * fake はここで完結し、real はここに加えて実際のトークン送金を行う
 */
export type MandateLedgerState = {
  mandates: Readonly<Record<MandateId, Mandate>>;
  authorizations: readonly Authorization[];
};

export const zeroLike = (money: Money): Money => {
  return { amount: mustParse(parseAmount(0)), currency: money.currency };
};

export const hasAuthorization = (
  state: MandateLedgerState,
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
const recordMandate = (state: MandateLedgerState, mandate: Mandate): void => {
  state.mandates = { ...state.mandates, [mandate.id]: mandate };
};

/**
 * 支払いが mandate の規則 (上限、期限、payment ref ごとに 1 回) を満たすかを検証する
 *
 * 送金 (fake は無条件、real は実際のトークン送金) より前に呼ぶことで、規則を満たさない支払いでは on-chain 呼び出しをしない
 */
export const validatePayment = (
  state: MandateLedgerState,
  request: PaymentRequest,
): Result<Mandate, MandateError> => {
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

  return ok({ ...mandate, spent: spent.value });
};

/**
 * 検証済みの支払いを台帳に反映する (mandate の `spent` を更新し、authorization を追加する)
 */
export const commitPayment = (
  state: MandateLedgerState,
  authorization: Authorization,
  updatedMandate: Mandate,
): void => {
  recordMandate(state, updatedMandate);
  state.authorizations = [...state.authorizations, authorization];
};

const isPayment = (
  mandateId: MandateId,
  paymentRef: PaymentRef,
): ((authorization: Authorization) => boolean) => {
  return (authorization) =>
    authorization.mandateId === mandateId &&
    authorization.paymentRef === paymentRef;
};

/**
 * 預かり中の支払いを解放して released に進める (fake と real で共通。real の送金は承認時に済んでいる)
 *
 * 承認が無ければ `notFound`、解放済みなら `notHeld`
 */
export const releaseIn = (
  state: MandateLedgerState,
  ids: MandateIds,
  mandateId: MandateId,
  paymentRef: PaymentRef,
  now: IsoDateTime,
): Result<Authorization, MandateError> => {
  const index = state.authorizations.findIndex(
    isPayment(mandateId, paymentRef),
  );
  const held = state.authorizations[index];

  if (held === undefined) {
    return err({ kind: "notFound", mandateId });
  }

  if (held.escrow.status !== "held") {
    return err({ kind: "notHeld", paymentRef });
  }

  const released: Authorization = {
    ...held,
    escrow: {
      status: "released",
      heldAt: held.escrow.heldAt,
      releasedAt: now,
      releaseRef: ids.newReleaseRef(),
    },
  };

  state.authorizations = state.authorizations.with(index, released);

  return ok(released);
};

export const createMandateIn = (
  state: MandateLedgerState,
  ids: MandateIds,
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

// 公開するのは commitment、ハッシュ、預かりの状態と額だけ
// 上限額と身元は private な状態に留める
// 送金の受取先と tx id も authorization には持つが、ここには載せない
export const publicLedgerOf = (state: MandateLedgerState): PublicLedgerView => {
  return {
    commitments: Object.values(state.mandates).map((mandate) => ({
      mandateId: mandate.id,
      commitment: mandate.commitment,
    })),
    authorizations: state.authorizations.map((authorization) => ({
      publicHash: authorization.publicHash,
    })),
    authorizedCount: state.authorizations.length,
    escrows: state.authorizations.map((authorization) => ({
      publicHash: authorization.publicHash,
      status: authorization.escrow.status,
      amount: authorization.amount,
    })),
  };
};
