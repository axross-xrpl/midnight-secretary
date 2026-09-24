"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState, useTransition } from "react";
import { match } from "ts-pattern";
import { FailureNotice } from "@/components/chat/failure-notice";
import { shortHash } from "@/components/chat/format";
import {
  detailKeyClass,
  detailListClass,
  detailRowClass,
  faintLabelClass,
  hashClass,
  monoValueClass,
  okPillClass,
} from "@/components/chat/styles";
import type { RequestFailure } from "@/components/chat/types";
import type { AgeRegistrationResponse } from "@/lib/secretary-response";
import {
  requestIssueAgeCredential,
  requestReadAgeCredential,
} from "./request-age-credential";

/**
 * 画面を開いた時点でサーバが読んだ証明書の状態
 *
 * `unavailable` は読みに行って失敗した状態で、未発行とは区別する
 * real では contract server が落ちているだけで読めなくなるので、同じに扱うと発行済みでも「未発行」に見えてしまう
 */
export type AgeCredentialInitial =
  | { kind: "none" }
  | { kind: "issued"; credential: AgeRegistrationResponse }
  | { kind: "unavailable" };

/**
 * 証明書の発行の状態
 *
 * `issued` は発行済みで証明書の中身を持ち、`failed` は発行に失敗してもう一度押せる状態
 * `unavailable` は発行済みかどうかが判らない状態で、発行ではなく読み直しを促す
 */
type CredentialState =
  | { kind: "none" }
  | { kind: "issuing" }
  | { kind: "issued"; credential: AgeRegistrationResponse }
  | { kind: "failed"; failure: RequestFailure }
  | { kind: "unavailable" };

type AgeCredentialCardProps = {
  initial: AgeCredentialInitial;
  hasBirthDate: boolean;
};

// 読めた結果を状態にする (未発行は undefined で返る)
const stateOf = (
  credential: AgeRegistrationResponse | undefined,
): CredentialState => {
  if (credential === undefined) {
    return { kind: "none" };
  }

  return { kind: "issued", credential };
};

// 明細の枠の id で、開閉ボタンの aria-controls が指す先
const DETAILS_ID = "age-credential-details";

// 区画の中の控えめな操作 (明細の開閉と読み直し)
const linkButtonClass =
  "inline-flex cursor-pointer items-center gap-1 rounded-md text-sm font-medium text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-60";

// 開いているかを向きで示す小さな山形
const Chevron = ({ isOpen }: { isOpen: boolean }): ReactElement => {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

type CredentialDetailsProps = {
  id: string;
  credential: AgeRegistrationResponse;
};

// 証明書の明細で、会話画面の証明の明細と同じ見た目にする
// 出すのは公開 ID と載っている場所の情報だけで、生年月日は応答に無いので出しようがない
const CredentialDetails = ({
  id,
  credential,
}: CredentialDetailsProps): ReactElement => {
  const t = useTranslations("ProfileSettings");
  // 中身は短い値ばかりなので、区画の幅いっぱいには広げず上限で止める
  const listClass = `${detailListClass} w-full max-w-md`;
  const identityRow = (
    <div className={detailRowClass}>
      <dt className={detailKeyClass}>{t("ageCredential.details.identity")}</dt>
      <dd className={hashClass} title={credential.identity}>
        {shortHash(credential.identity)}
      </dd>
    </div>
  );

  const body = match(credential.origin)
    .returnType<ReactElement>()
    .with({ kind: "midnight" }, ({ dobCommitment, contractAddress }) => (
      <dl className={listClass}>
        {identityRow}
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>
            {t("ageCredential.details.dobCommitment")}
          </dt>
          <dd className={hashClass} title={dobCommitment}>
            {shortHash(dobCommitment)}
          </dd>
        </div>
        <div className={detailRowClass}>
          <dt className={detailKeyClass}>
            {t("ageCredential.details.contractAddress")}
          </dt>
          <dd className={monoValueClass} title={contractAddress}>
            {shortHash(contractAddress)}
          </dd>
        </div>
      </dl>
    ))
    .with({ kind: "memory" }, () => (
      <>
        <dl className={listClass}>{identityRow}</dl>
        <p className={faintLabelClass}>{t("ageCredential.details.memory")}</p>
      </>
    ))
    .exhaustive();

  return (
    <div id={id} className="flex w-full max-w-md flex-col gap-2">
      {body}
    </div>
  );
};

/**
 * 年齢確認証明書を発行する区画
 *
 * 発行はこの画面の明示的な 1 手で、承認のときには自動で登録しない
 * 発行済みかどうかを読めなかったときは発行を促さず、読み直しを出す (押しても登録済みで弾かれるだけなので)
 * 発行済みかどうかはラベルで示し、公開 ID と載っている場所の明細はその隣のボタンで開く (生年月日は出さない)
 * ラベルを押せるようにすると状態表示と操作の区別が付かないので、分けている
 * プロフィールに生年月日が無い間はボタンを無効にする
 */
export const AgeCredentialCard = ({
  initial,
  hasBirthDate,
}: AgeCredentialCardProps): ReactElement => {
  const t = useTranslations("ProfileSettings");
  const [state, setState] = useState<CredentialState>(initial);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const runIssue = async (): Promise<void> => {
    const issued = await requestIssueAgeCredential(fetch);

    if (!issued.ok) {
      setState({ kind: "failed", failure: issued.error });

      return;
    }

    setState({ kind: "issued", credential: issued.value });
  };

  const handleIssue = (): void => {
    setState({ kind: "issuing" });
    startTransition(runIssue);
  };

  const runRecheck = async (): Promise<void> => {
    const read = await requestReadAgeCredential(fetch);

    if (!read.ok) {
      setState({ kind: "unavailable" });

      return;
    }

    setState(stateOf(read.value));
  };

  const handleRecheck = (): void => {
    startTransition(runRecheck);
  };

  const issueButton = (
    <button
      type="button"
      className="self-start rounded-lg bg-accent px-5 py-2.5 text-base font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
      disabled={isPending || !hasBirthDate}
      aria-busy={isPending}
      onClick={handleIssue}
    >
      {t("ageCredential.issue")}
    </button>
  );

  const birthDateNote = hasBirthDate ? undefined : (
    <p className={faintLabelClass}>{t("ageCredential.needsBirthDate")}</p>
  );

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-lg font-semibold">{t("ageCredential.title")}</h3>
      <p className="mt-1.5 text-sm text-muted">
        {t("ageCredential.description")}
      </p>
      <div className="mt-4 flex flex-col items-start gap-3">
        {match(state)
          .returnType<ReactElement>()
          .with({ kind: "issued" }, ({ credential }) => (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className={okPillClass}>{t("ageCredential.issued")}</span>
                <button
                  type="button"
                  className={linkButtonClass}
                  aria-expanded={isOpen}
                  aria-controls={DETAILS_ID}
                  onClick={() => setIsOpen((open) => !open)}
                >
                  {t("ageCredential.details.toggle")}
                  <Chevron isOpen={isOpen} />
                </button>
              </div>
              {isOpen ? (
                <CredentialDetails id={DETAILS_ID} credential={credential} />
              ) : undefined}
            </>
          ))
          .with({ kind: "failed" }, ({ failure }) => (
            <>
              {issueButton}
              {birthDateNote}
              <FailureNotice failure={failure} />
            </>
          ))
          .with({ kind: "unavailable" }, () => (
            <>
              <p className={faintLabelClass}>
                {t("ageCredential.unavailable")}
              </p>
              <button
                type="button"
                className={linkButtonClass}
                disabled={isPending}
                aria-busy={isPending}
                onClick={handleRecheck}
              >
                {t("ageCredential.recheck")}
              </button>
            </>
          ))
          .with({ kind: "none" }, { kind: "issuing" }, () => (
            <>
              {issueButton}
              {birthDateNote}
            </>
          ))
          .exhaustive()}
      </div>
    </section>
  );
};
