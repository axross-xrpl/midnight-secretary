"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { AuthorizationResponse } from "@/lib/secretary-response";
import { moneyText, plainSpaces, shortHash, TIMED_OPTIONS } from "./format";
import {
  detailKeyClass,
  detailListClass,
  detailRowClass,
  hashClass,
  monoValueClass,
} from "./styles";
import { useFormatNumber } from "./use-format-number";

type AuthorizationRowProps = {
  authorization: AuthorizationResponse;
};

const AuthorizationRow = ({
  authorization,
}: AuthorizationRowProps): ReactElement => {
  const t = useTranslations("Conversation");
  const format = useFormatter();
  const formatNumber = useFormatNumber();

  return (
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
        <dd className="font-bold tabular-nums">
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
        <dt className={detailKeyClass}>{t("authorization.transaction")}</dt>
        <dd className={monoValueClass}>
          {authorization.settlement.transactionId}
        </dd>
      </div>
    </dl>
  );
};

type AuthorizationListProps = {
  authorizations: readonly AuthorizationResponse[];
};

/**
 * 承認済みの支払いの一覧 (公開ハッシュ、支払い参照、金額、承認日時、トランザクション)
 *
 * 支払い済みと一部支払い済みの吹き出しの中に置く
 */
export const AuthorizationList = ({
  authorizations,
}: AuthorizationListProps): ReactElement => {
  return (
    <div className="flex flex-col gap-2">
      {authorizations.map((authorization) => (
        <AuthorizationRow
          key={authorization.paymentRef}
          authorization={authorization}
        />
      ))}
    </div>
  );
};
