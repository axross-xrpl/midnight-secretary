"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState, useTransition } from "react";
import { match } from "ts-pattern";
import { useRouter } from "@/i18n/navigation";
import type {
  AuthorizationResponse,
  TripResponse,
  EscrowResponse,
  SettlementVisibilityResponse,
} from "@/lib/secretary-response";
import { FailureNotice } from "./failure-notice";
import { moneyText, plainSpaces, shortHash, TIMED_OPTIONS } from "./format";
import { escrowOf, requestConfirmReceipt } from "./request-confirm-receipt";
import {
  detailKeyClass,
  detailListClass,
  detailRowClass,
  hashClass,
  monoValueClass,
  okPillClass,
  privatePillClass,
  smallGhostButtonClass,
} from "./styles";
import type { RequestFailure } from "./types";
import { useFormatNumber } from "./use-format-number";

// 送金の形が公開範囲そのものなので、kind から文言のキーを引く
const visibilityOfSettlement = (
  settlement: AuthorizationResponse["settlement"],
): SettlementVisibilityResponse => {
  return match(settlement)
    .returnType<SettlementVisibilityResponse>()
    .with({ kind: "tokenTransfer" }, () => "public")
    .with({ kind: "shieldedTransfer" }, () => "private")
    .exhaustive();
};

// 受取の確認の進み具合
// 直近の応答 (`fresh`) が props より優先されるので、確認できた預かりの状態は行の手元にも持つ
type ReceiptState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "failed"; failure: RequestFailure }
  | { kind: "confirmed"; escrow: EscrowResponse };

const IDLE: ReceiptState = { kind: "idle" };

type EscrowPillProps = {
  escrow: EscrowResponse;
};

const EscrowPill = ({ escrow }: EscrowPillProps): ReactElement => {
  const t = useTranslations("Conversation");

  return match(escrow)
    .with({ status: "held" }, () => (
      <span className={privatePillClass}>{t("authorization.escrowHeld")}</span>
    ))
    .with({ status: "released" }, () => (
      <span className={okPillClass}>{t("authorization.escrowReleased")}</span>
    ))
    .exhaustive();
};

/**
 * 受取の確認が通ったあと、差し替わった出張を会話に知らせる
 *
 * 会話は直近の応答を props より優先するので、refresh だけではサイドバーが追いつかない
 */
export type TripUpdatedHandler = (trip: TripResponse) => void;

type AuthorizationRowProps = {
  tripId: string;
  authorization: AuthorizationResponse;
  onTripUpdated: TripUpdatedHandler;
};

const AuthorizationRow = ({
  tripId,
  authorization,
  onTripUpdated,
}: AuthorizationRowProps): ReactElement => {
  const t = useTranslations("Conversation");
  const format = useFormatter();
  const formatNumber = useFormatNumber();
  const router = useRouter();
  const [state, setState] = useState<ReceiptState>(IDLE);
  const [, startTransition] = useTransition();
  const escrow =
    state.kind === "confirmed" ? state.escrow : authorization.escrow;

  const runConfirm = async (): Promise<void> => {
    const confirmed = await requestConfirmReceipt(
      fetch,
      tripId,
      authorization.paymentRef,
    );

    if (!confirmed.ok) {
      setState({ kind: "failed", failure: confirmed.error });

      return;
    }

    const released = escrowOf(confirmed.value, authorization.paymentRef);

    // 応答にこの支払いが無ければ refresh 後の props に任せる
    setState(
      released === undefined ? IDLE : { kind: "confirmed", escrow: released },
    );
    onTripUpdated(confirmed.value);
    router.refresh();
  };

  const handleConfirm = (): void => {
    setState({ kind: "confirming" });
    startTransition(runConfirm);
  };

  return (
    <>
      <dl className={detailListClass}>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>{t("authorization.publicHash")}</dt>
          <dd className={hashClass} title={authorization.publicHash}>
            {shortHash(authorization.publicHash)}
          </dd>
        </div>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>{t("authorization.paymentRef")}</dt>
          <dd className={monoValueClass}>{authorization.paymentRef}</dd>
        </div>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>{t("authorization.amount")}</dt>
          <dd className="font-semibold tabular-nums">
            {moneyText(authorization.amount, formatNumber)}
          </dd>
        </div>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>{t("authorization.authorizedAt")}</dt>
          <dd>
            {plainSpaces(
              format.dateTime(
                new Date(authorization.authorizedAt),
                TIMED_OPTIONS,
              ),
            )}
          </dd>
        </div>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>{t("authorization.visibility")}</dt>
          <dd>
            {t(
              `plan.visibility.${visibilityOfSettlement(authorization.settlement)}`,
            )}
          </dd>
        </div>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>{t("authorization.transaction")}</dt>
          <dd className={monoValueClass}>
            {authorization.settlement.transactionId}
          </dd>
        </div>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>{t("authorization.escrow")}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <EscrowPill escrow={escrow} />
            {escrow.status === "held" ? (
              <button
                type="button"
                className={smallGhostButtonClass}
                onClick={handleConfirm}
                disabled={state.kind === "confirming"}
              >
                {state.kind === "confirming"
                  ? t("authorization.confirming")
                  : t("authorization.confirmReceipt")}
              </button>
            ) : undefined}
          </dd>
        </div>
      </dl>
      {state.kind === "failed" ? (
        <FailureNotice failure={state.failure} />
      ) : undefined}
    </>
  );
};

type AuthorizationListProps = {
  tripId: string;
  authorizations: readonly AuthorizationResponse[];
  onTripUpdated: TripUpdatedHandler;
};

/**
 * 承認済みの支払いの一覧 (公開ハッシュ、支払い参照、金額、承認日時、公開範囲、トランザクション、預かりの状態)
 *
 * 支払い済みと一部支払い済みの吹き出しの中に置く
 * 預かり中の行には受取の確認のボタンがあり、`tripId` はその API のパスに使う
 */
export const AuthorizationList = ({
  tripId,
  authorizations,
  onTripUpdated,
}: AuthorizationListProps): ReactElement => {
  return (
    <div className="flex flex-col gap-3">
      {authorizations.map((authorization) => (
        <AuthorizationRow
          key={authorization.paymentRef}
          tripId={tripId}
          authorization={authorization}
          onTripUpdated={onTripUpdated}
        />
      ))}
    </div>
  );
};
