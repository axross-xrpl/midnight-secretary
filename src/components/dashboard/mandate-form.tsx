"use client";

import { useTranslations } from "next-intl";
import type { FormEvent, ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { MandateResponse } from "@/lib/secretary-response";
import type { MandateFormError, MandateFormValues } from "./expiry-input";
import { buildSetUpMandateBody, defaultExpiryInput } from "./expiry-input";
import { FailureNotice } from "./failure-notice";
import { requestSetUpMandate } from "./request-secretary";
import {
  cardClass,
  labelClass,
  privatePillClass,
  strongButtonClass,
} from "./styles";
import type { RequestFailure } from "./types";

// Wave 1 の支払いはデモ用トークン 1 本なので、通貨は選ばせず見出しに出すだけ
const CAP_CURRENCY = "DEMO";

const DEFAULT_CAP = "100000";

const inputClass =
  "rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-ink";

const fieldErrorClass = "text-[11.5px] font-semibold text-danger";

// label と input を結ぶ id (ページに 1 つしか出ないフォームなので固定でよい)
const FIELD_IDS = {
  cap: "mandate-cap",
  expiresAt: "mandate-expires-at",
  purpose: "mandate-purpose",
} as const satisfies Record<MandateFormError["field"], string>;

type SetupState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "invalid"; error: MandateFormError }
  | { status: "failed"; failure: RequestFailure };

type Props = {
  now: string;
  onCreated: (mandate: MandateResponse) => void;
};

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
};

const Field = ({ id, label, error, children }: FieldProps): ReactElement => {
  return (
    <div className="flex flex-col gap-1">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      {children}
      {error === undefined ? undefined : (
        <span className={fieldErrorClass} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

/**
 * 支払い枠がまだ無いユーザに出す設定フォーム
 *
 * cap は demo トークンの整数、期限は datetime-local、用途は 1 行
 */
export const MandateForm = ({ now, onCreated }: Props): ReactElement => {
  const t = useTranslations("MandateForm");
  const [values, setValues] = useState<MandateFormValues>({
    cap: DEFAULT_CAP,
    expiresAt: defaultExpiryInput(now),
    purpose: "",
  });
  const [state, setState] = useState<SetupState>({ status: "idle" });
  const submitting = state.status === "submitting";
  const errorFor = (field: MandateFormError["field"]): string | undefined => {
    if (state.status !== "invalid" || state.error.field !== field) {
      return undefined;
    }

    return t(`errors.${field}`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const body = buildSetUpMandateBody(values, now);

    if (!body.ok) {
      setState({ status: "invalid", error: body.error });
      return;
    }

    setState({ status: "submitting" });
    const created = await requestSetUpMandate(fetch, body.value);

    if (!created.ok) {
      setState({ status: "failed", failure: created.error });
      return;
    }

    setState({ status: "idle" });
    onCreated(created.value);
  };

  return (
    <section className={`${cardClass} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs text-muted">{t("title")}</h2>
          <span className={privatePillClass}>{t("badge")}</span>
        </div>
        <p className={labelClass}>{t("lead")}</p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Field
          id={FIELD_IDS.cap}
          label={t("cap", { currency: CAP_CURRENCY })}
          error={errorFor("cap")}
        >
          <input
            id={FIELD_IDS.cap}
            className={`${inputClass} tabular-nums`}
            type="number"
            min="1"
            step="1"
            value={values.cap}
            disabled={submitting}
            onChange={(event) =>
              setValues({ ...values, cap: event.target.value })
            }
          />
        </Field>
        <Field
          id={FIELD_IDS.expiresAt}
          label={t("expiresAt")}
          error={errorFor("expiresAt")}
        >
          <input
            id={FIELD_IDS.expiresAt}
            className={inputClass}
            type="datetime-local"
            value={values.expiresAt}
            disabled={submitting}
            onChange={(event) =>
              setValues({ ...values, expiresAt: event.target.value })
            }
          />
        </Field>
        <Field
          id={FIELD_IDS.purpose}
          label={t("purpose")}
          error={errorFor("purpose")}
        >
          <input
            id={FIELD_IDS.purpose}
            className={inputClass}
            type="text"
            placeholder={t("purposePlaceholder")}
            value={values.purpose}
            disabled={submitting}
            onChange={(event) =>
              setValues({ ...values, purpose: event.target.value })
            }
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={strongButtonClass}
            disabled={submitting}
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>

      {state.status === "failed" ? (
        <FailureNotice failure={state.failure} />
      ) : undefined}
    </section>
  );
};
