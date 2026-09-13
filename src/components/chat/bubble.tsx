"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import { AuthorizationList } from "./authorization-list";
import type { Bubble, SecretaryLine, UserLine } from "./conversation";
import { FailureNotice } from "./failure-notice";
import { moneyText, plainSpaces, TIMED_OPTIONS } from "./format";
import { PlanDetails } from "./plan-details";
import {
  bubbleTimeClass,
  detailKeyClass,
  detailListClass,
  detailRowClass,
  monoValueClass,
  secretaryAvatarClass,
  secretaryBubbleClass,
  userBubbleClass,
} from "./styles";
import { useFormatNumber } from "./use-format-number";

type SecretaryContentProps = {
  line: SecretaryLine;
};

// 秘書の吹き出しの中身 (文言と、あれば計画や支払いの明細)
const SecretaryContent = ({ line }: SecretaryContentProps): ReactElement => {
  const t = useTranslations("Conversation");
  const formatNumber = useFormatNumber();

  return match(line)
    .with({ kind: "greeting" }, ({ title, cap }) => (
      <p>{t("lines.greeting", { title, cap: moneyText(cap, formatNumber) })}</p>
    ))
    .with({ kind: "ask" }, ({ title }) => <p>{t("lines.ask", { title })}</p>)
    .with({ kind: "proposal" }, ({ plan }) => (
      <>
        <p>
          {t("lines.proposal", { total: moneyText(plan.total, formatNumber) })}
        </p>
        <PlanDetails plan={plan} />
      </>
    ))
    .with({ kind: "askPay" }, () => <p>{t("lines.askPay")}</p>)
    .with({ kind: "partiallyPaid" }, ({ authorizations }) => (
      <>
        <p>{t("lines.partiallyPaid", { count: authorizations.length })}</p>
        <AuthorizationList authorizations={authorizations} />
      </>
    ))
    .with({ kind: "paid" }, ({ authorizations }) => (
      <>
        <p>{t("lines.paid", { count: authorizations.length })}</p>
        <AuthorizationList authorizations={authorizations} />
      </>
    ))
    .with({ kind: "askWriteBack" }, () => <p>{t("lines.askWriteBack")}</p>)
    .with({ kind: "written" }, ({ writtenEventId }) => (
      <>
        <p>{t("lines.written")}</p>
        {/* 予定の ID は文言に混ぜず、支払いの明細と同じ形の補足の行に置く */}
        <dl className={detailListClass}>
          <div className={detailRowClass}>
            <dt className={detailKeyClass}>{t("writtenEvent")}</dt>
            <dd className={monoValueClass}>{writtenEventId}</dd>
          </div>
        </dl>
      </>
    ))
    .with({ kind: "working" }, ({ step, title }) => (
      <p
        className="flex flex-wrap items-center gap-2.5 font-semibold"
        role="status"
        aria-busy="true"
      >
        <span
          className="h-2 w-2 animate-pulse rounded-full bg-accent"
          aria-hidden="true"
        />
        {t(`lines.working.${step}`, { title })}
      </p>
    ))
    .with({ kind: "failed" }, ({ failure }) => (
      <>
        <p>{t("lines.failed")}</p>
        <FailureNotice failure={failure} />
      </>
    ))
    .exhaustive();
};

type SecretaryBubbleProps = {
  line: SecretaryLine;
  at?: string;
};

const SecretaryBubble = ({ line, at }: SecretaryBubbleProps): ReactElement => {
  const t = useTranslations("Conversation");
  const format = useFormatter();

  return (
    <li className="flex items-start gap-2.5">
      <span className={secretaryAvatarClass} aria-hidden="true">
        {t("secretary")}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className={secretaryBubbleClass}>
          <SecretaryContent line={line} />
        </div>
        {at === undefined ? undefined : (
          <time className={bubbleTimeClass} dateTime={at}>
            {plainSpaces(format.dateTime(new Date(at), TIMED_OPTIONS))}
          </time>
        )}
      </div>
    </li>
  );
};

type UserBubbleProps = {
  line: UserLine;
};

const UserBubble = ({ line }: UserBubbleProps): ReactElement => {
  const t = useTranslations("Conversation");
  const text = match(line)
    .with({ kind: "propose" }, () => t("echo.propose"))
    .with({ kind: "approve" }, () => t("echo.approve"))
    .with({ kind: "pay", resume: true }, () => t("echo.resume"))
    .with({ kind: "pay", resume: false }, () => t("echo.pay"))
    .with({ kind: "writeBack" }, () => t("echo.writeBack"))
    .exhaustive();

  return (
    <li className="flex flex-col items-end gap-1">
      <div className={userBubbleClass}>{text}</div>
    </li>
  );
};

type BubbleItemProps = {
  bubble: Bubble;
};

/**
 * 会話ログの吹き出し 1 つ
 *
 * 秘書は左にアバター付き、ユーザは右に出す
 */
export const BubbleItem = ({ bubble }: BubbleItemProps): ReactElement => {
  return match(bubble)
    .with({ speaker: "secretary" }, ({ line, at }) => (
      <SecretaryBubble line={line} at={at} />
    ))
    .with({ speaker: "user" }, ({ line }) => <UserBubble line={line} />)
    .exhaustive();
};
