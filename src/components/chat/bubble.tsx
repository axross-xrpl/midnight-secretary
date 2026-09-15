"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import { AuthorizationList } from "./authorization-list";
import type { Bubble, SecretaryLine, UserLine } from "./conversation";
import { FailureNotice } from "./failure-notice";
import {
  asOfDateOf,
  DATE_OPTIONS,
  moneyText,
  plainSpaces,
  shortHash,
  TIMED_OPTIONS,
} from "./format";
import type { VisibilityChangeHandler } from "./plan-details";
import { PlanDetails } from "./plan-details";
import {
  bubbleTimeClass,
  detailKeyClass,
  detailListClass,
  detailRowClass,
  hashClass,
  monoValueClass,
  secretaryAvatarClass,
  secretaryBubbleClass,
  userBubbleClass,
} from "./styles";
import { useFormatNumber } from "./use-format-number";

type SecretaryContentProps = {
  line: SecretaryLine;
  onVisibilityChange: VisibilityChangeHandler;
};

// 秘書の吹き出しの中身 (文言と、あれば計画や支払いの明細)
const SecretaryContent = ({
  line,
  onVisibilityChange,
}: SecretaryContentProps): ReactElement => {
  const t = useTranslations("Conversation");
  const format = useFormatter();
  const formatNumber = useFormatNumber();

  return match(line)
    .with({ kind: "greeting" }, ({ title, cap }) => (
      <p>{t("lines.greeting", { title, cap: moneyText(cap, formatNumber) })}</p>
    ))
    .with({ kind: "ask" }, ({ title }) => <p>{t("lines.ask", { title })}</p>)
    .with({ kind: "proposal" }, ({ plan, visibility }) => (
      <>
        <p>
          {t("lines.proposal", { total: moneyText(plan.total, formatNumber) })}
        </p>
        <PlanDetails
          plan={plan}
          visibility={visibility}
          onVisibilityChange={onVisibilityChange}
        />
      </>
    ))
    .with({ kind: "askProof" }, ({ place, ageLimit }) => (
      <p>{t("lines.askProof", { place: place.name, age: ageLimit })}</p>
    ))
    .with({ kind: "ageRejected" }, ({ place, ageLimit, cutoffDate }) => (
      <p>
        {t("lines.ageRejected", {
          date: plainSpaces(
            format.dateTime(
              new Date(asOfDateOf(cutoffDate, ageLimit)),
              DATE_OPTIONS,
            ),
          ),
          age: ageLimit,
          place: place.name,
        })}
      </p>
    ))
    .with({ kind: "ageVerified" }, ({ proof, ageLimit }) => (
      <>
        <p>
          {t("lines.ageVerified", {
            date: plainSpaces(
              format.dateTime(
                new Date(asOfDateOf(proof.cutoffDate, ageLimit)),
                DATE_OPTIONS,
              ),
            ),
            age: ageLimit,
          })}
        </p>
        {/* 公開されるのは identity と証明の参照だけで、生年月日は出ない */}
        <dl className={detailListClass}>
          <div className={detailRowClass}>
            <dt className={detailKeyClass}>{t("ageProof.identity")}</dt>
            <dd className={hashClass} title={proof.identity}>
              {shortHash(proof.identity)}
            </dd>
          </div>
          <div className={detailRowClass}>
            <dt className={detailKeyClass}>{t("ageProof.ref")}</dt>
            <dd className={monoValueClass}>{proof.proofRef}</dd>
          </div>
        </dl>
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
    .with({ kind: "written" }, ({ writtenEventId, confirmedStoreFailed }) => (
      <>
        <p>{t("lines.written")}</p>
        {/* 予定の ID は文言に混ぜず、支払いの明細と同じ形の補足の行に置く */}
        <dl className={detailListClass}>
          <div className={detailRowClass}>
            <dt className={detailKeyClass}>{t("writtenEvent")}</dt>
            <dd className={monoValueClass}>{writtenEventId}</dd>
          </div>
        </dl>
        {/* カレンダーには書けているので、確定旅程の保存の失敗は補足の 1 行だけにする */}
        {confirmedStoreFailed ? (
          <p className="text-[12.5px] text-muted">
            {t("lines.confirmedStoreFailed")}
          </p>
        ) : undefined}
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
  onVisibilityChange: VisibilityChangeHandler;
};

const SecretaryBubble = ({
  line,
  at,
  onVisibilityChange,
}: SecretaryBubbleProps): ReactElement => {
  const t = useTranslations("Conversation");
  const format = useFormatter();

  return (
    <li className="flex items-start gap-2.5">
      <span className={secretaryAvatarClass} aria-hidden="true">
        {t("secretary")}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className={secretaryBubbleClass}>
          <SecretaryContent
            line={line}
            onVisibilityChange={onVisibilityChange}
          />
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
    .with({ kind: "approve", privateCount: 0 }, () => t("echo.approve"))
    .with({ kind: "approve" }, ({ privateCount }) =>
      t("echo.approvePartlyPrivate", { count: privateCount }),
    )
    .with({ kind: "sendProof" }, () => t("echo.sendProof"))
    .with({ kind: "replan" }, () => t("echo.replan"))
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
  onVisibilityChange: VisibilityChangeHandler;
};

/**
 * 会話ログの吹き出し 1 つ
 *
 * 秘書は左にアバター付き、ユーザは右に出す
 * `onVisibilityChange` は提案の計画に置く公開範囲のトグルが使う
 */
export const BubbleItem = ({
  bubble,
  onVisibilityChange,
}: BubbleItemProps): ReactElement => {
  return match(bubble)
    .with({ speaker: "secretary" }, ({ line, at }) => (
      <SecretaryBubble
        line={line}
        at={at}
        onVisibilityChange={onVisibilityChange}
      />
    ))
    .with({ speaker: "user" }, ({ line }) => <UserBubble line={line} />)
    .exhaustive();
};
