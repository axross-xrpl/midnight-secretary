"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState, useTransition } from "react";
import { match } from "ts-pattern";
import { FailureNotice } from "@/components/chat/failure-notice";
import { faintLabelClass, okPillClass } from "@/components/chat/styles";
import type { RequestFailure } from "@/components/chat/types";
import type { AgeRegistrationResponse } from "@/lib/secretary-response";
import { requestIssueAgeCredential } from "./request-age-credential";

/**
 * 証明書の発行の状態
 *
 * `issued` は発行済みで、`failed` は発行に失敗してもう一度押せる状態
 */
type CredentialState =
  | { kind: "none" }
  | { kind: "issuing" }
  | { kind: "issued" }
  | { kind: "failed"; failure: RequestFailure };

type AgeCredentialCardProps = {
  initial?: AgeRegistrationResponse;
  hasBirthDate: boolean;
};

const initialState = (
  credential: AgeRegistrationResponse | undefined,
): CredentialState => {
  if (credential === undefined) {
    return { kind: "none" };
  }

  return { kind: "issued" };
};

/**
 * 年齢確認証明書を発行する区画
 *
 * 発行はこの画面の明示的な 1 手で、承認のときには自動で登録しない
 * 発行済みかどうかだけを見せ、生年月日も公開 ID も出さない
 * プロフィールに生年月日が無い間はボタンを無効にする
 */
export const AgeCredentialCard = ({
  initial,
  hasBirthDate,
}: AgeCredentialCardProps): ReactElement => {
  const t = useTranslations("ProfileSettings");
  const [state, setState] = useState<CredentialState>(initialState(initial));
  const [isPending, startTransition] = useTransition();

  const runIssue = async (): Promise<void> => {
    const issued = await requestIssueAgeCredential(fetch);

    if (!issued.ok) {
      setState({ kind: "failed", failure: issued.error });

      return;
    }

    setState({ kind: "issued" });
  };

  const handleIssue = (): void => {
    setState({ kind: "issuing" });
    startTransition(runIssue);
  };

  const issueButton = (
    <button
      type="button"
      className="self-start rounded-lg bg-[#185fa5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#144e88] disabled:opacity-60"
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
    <section className="rounded-2xl border border-[#e5e8ec] bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold">{t("ageCredential.title")}</h3>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">
        {t("ageCredential.description")}
      </p>
      <div className="mt-4 flex flex-col items-start gap-2">
        {match(state)
          .returnType<ReactElement>()
          .with({ kind: "issued" }, () => (
            <span className={okPillClass}>{t("ageCredential.issued")}</span>
          ))
          .with({ kind: "failed" }, ({ failure }) => (
            <>
              {issueButton}
              {birthDateNote}
              <FailureNotice failure={failure} />
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
