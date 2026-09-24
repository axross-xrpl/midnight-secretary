"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import type { Priority, ResidenceOption } from "@/features/profile/constants";
import {
  MAX_GENRES,
  OVERSEAS_RESIDENCE,
  priorities,
  residenceOptions,
} from "@/features/profile/constants";
import type { GenreOptions, HomeOption } from "@/features/profile/options";
import type { ProfileDto, ProfileField } from "@/features/profile/schemas";
import { profileSaveSchema } from "@/features/profile/schemas";
import { useRouter } from "@/i18n/navigation";
import { ProfileReadiness } from "./profile-readiness";
import { requestProfileSave } from "./request-profile-save";
import { WalletConnectField } from "./wallet-connect-field";

const inputClass =
  "w-full rounded-lg border border-[#e5e8ec] px-3 py-2 text-sm outline-none transition focus:border-[#185fa5] focus:ring-2 focus:ring-blue-100";

/**
 * 入力中の値
 *
 * 未入力を空文字で持ち、送信するときに null へ寄せる (スキーマの前処理に任せる)
 */
type FormValues = {
  fullName: string;
  address: string;
  birthDate: string;
  residencePref: ResidenceOption | "";
  homeCity: string;
  homeSpot: string;
  diningGenres: string[];
  leisureGenres: string[];
  budget: string;
  priority: Priority | "";
  walletAddress: string;
};

type ProfileFormProps = {
  initialProfile: ProfileDto | undefined;
  email: string;
  defaultFullName: string | null;
  homeOptions: HomeOption[];
  genreOptions: GenreOptions;
};

type Banner = "invalid" | "conflict" | "notFound" | "failed";

/** 画面の状態がサーバとずれているので、再読み込みで直すもの */
const needsReload = (banner: Banner): boolean => {
  return banner === "conflict" || banner === "notFound";
};

const toFormValues = (
  profile: ProfileDto | undefined,
  defaultFullName: string | null,
  defaultHomeCity: string,
): FormValues => ({
  fullName: profile?.fullName ?? defaultFullName ?? "",
  address: profile?.address ?? "",
  birthDate: profile?.birthDate ?? "",
  residencePref: (profile?.residencePref ?? "") as ResidenceOption | "",
  homeCity: profile?.homeCity ?? defaultHomeCity,
  homeSpot: profile?.homeSpot ?? "",
  diningGenres: profile?.diningGenres ?? [],
  leisureGenres: profile?.leisureGenres ?? [],
  budget:
    profile?.budget === null || profile?.budget === undefined
      ? ""
      : String(profile.budget),
  priority: profile?.priority ?? "",
  walletAddress: profile?.walletAddress ?? "",
});

const toSaveInput = (values: FormValues, updatedAt: string | undefined) => ({
  fullName: values.fullName,
  address: values.address,
  birthDate: values.birthDate,
  residencePref: values.residencePref,
  homeCity: values.homeCity,
  homeSpot: values.homeSpot,
  diningGenres: values.diningGenres,
  leisureGenres: values.leisureGenres,
  budget: values.budget === "" ? null : Number(values.budget),
  priority: values.priority,
  walletAddress: values.walletAddress,
  ...(updatedAt === undefined ? {} : { updatedAt }),
});

export function ProfileForm({
  initialProfile,
  email,
  defaultFullName,
  homeOptions,
  genreOptions,
}: ProfileFormProps) {
  const t = useTranslations("ProfileSettings");
  const router = useRouter();
  // 選べる拠点が1つしかないなら選ぶ意味がないので、最初から入れておく
  const defaultHomeCity = homeOptions.length === 1 ? homeOptions[0].city : "";
  const initialValues = toFormValues(
    initialProfile,
    defaultFullName,
    defaultHomeCity,
  );

  const [values, setValues] = useState(initialValues);
  const [savedValues, setSavedValues] = useState(initialValues);
  const [savedUpdatedAt, setSavedUpdatedAt] = useState(
    initialProfile?.updatedAt,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [errorFields, setErrorFields] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const isDirty = JSON.stringify(values) !== JSON.stringify(savedValues);

  // 保存せずに閉じようとしたら引き止める
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const confirmLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", confirmLeave);

    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [isDirty]);

  const update = (patch: Partial<FormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setStatus("idle");
    setBanner(null);
  };

  // 起点は都市ごとに異なるので、都市を変えたら選び直させる
  const selectHomeCity = (city: string) => {
    update({ homeCity: city, homeSpot: "" });
  };

  const spotOptions =
    homeOptions.find(({ city }) => city === values.homeCity)?.spots ?? [];

  const save = async () => {
    const parsed = profileSaveSchema.safeParse(
      toSaveInput(values, savedUpdatedAt),
    );

    if (!parsed.success) {
      setErrorFields(new Set(Object.keys(parsed.error.flatten().fieldErrors)));
      setBanner("invalid");
      return;
    }

    setStatus("saving");
    setErrorFields(new Set());
    setBanner(null);

    const result = await requestProfileSave(fetch, parsed.data);

    if (result.ok) {
      const next = toFormValues(result.value, null, defaultHomeCity);
      setValues(next);
      setSavedValues(next);
      setSavedUpdatedAt(result.value.updatedAt);
      setStatus("saved");
      return;
    }

    setStatus("idle");

    setErrorFields(new Set(result.error.fields));
    setBanner(result.error.kind);
  };

  const errorFor = (field: ProfileField) =>
    errorFields.has(field) ? t(`errors.field.${field}`) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,720px)_minmax(0,320px)]">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="rounded-2xl border border-[#e5e8ec] bg-white p-6 shadow-sm sm:p-8"
      >
        {banner !== null && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
            <p>{t(`errors.${banner}`)}</p>
            {needsReload(banner) && (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="shrink-0 font-semibold underline"
              >
                {t("reload")}
              </button>
            )}
          </div>
        )}

        {initialProfile === undefined && (
          <p className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-[#185fa5]">
            {t("newProfileNotice")}
          </p>
        )}

        <Section title={t("sections.basic")}>
          <Field label={t("labels.email")}>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {email}
            </p>
            <Hint>{t("hints.email")}</Hint>
          </Field>
          <Field label={t("labels.fullName")} error={errorFor("fullName")}>
            {(id) => (
              <input
                id={id}
                value={values.fullName}
                onChange={(event) => update({ fullName: event.target.value })}
                maxLength={80}
                className={inputClass}
              />
            )}
          </Field>
          <Field label={t("labels.address")} error={errorFor("address")}>
            {(id) => (
              <>
                <input
                  id={id}
                  value={values.address}
                  onChange={(event) => update({ address: event.target.value })}
                  maxLength={200}
                  className={inputClass}
                />
                <Hint>{t("hints.address")}</Hint>
              </>
            )}
          </Field>
        </Section>

        <Section
          title={t("sections.verification")}
          description={t("hints.verification")}
        >
          <Field label={t("labels.birthDate")} error={errorFor("birthDate")}>
            {(id) => (
              <>
                <input
                  id={id}
                  type="date"
                  value={values.birthDate}
                  onChange={(event) =>
                    update({ birthDate: event.target.value })
                  }
                  className={`${inputClass} tabular-nums`}
                />
                <Hint>{t("hints.birthDate")}</Hint>
              </>
            )}
          </Field>
          <Field
            label={t("labels.residencePref")}
            error={errorFor("residencePref")}
          >
            {(id) => (
              <>
                <select
                  id={id}
                  value={values.residencePref}
                  onChange={(event) =>
                    update({
                      residencePref: event.target.value as ResidenceOption | "",
                    })
                  }
                  className={`${inputClass} bg-white`}
                >
                  <option value="">{t("unselected")}</option>
                  {residenceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === OVERSEAS_RESIDENCE
                        ? t("residenceOverseas")
                        : option}
                    </option>
                  ))}
                </select>
                <Hint>{t("hints.residencePref")}</Hint>
              </>
            )}
          </Field>
        </Section>

        <Section title={t("sections.home")} description={t("hints.home")}>
          <Field label={t("labels.homeCity")} error={errorFor("homeCity")}>
            {(id) => (
              <select
                id={id}
                value={values.homeCity}
                onChange={(event) => selectHomeCity(event.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="">{t("unselected")}</option>
                {homeOptions.map(({ city }) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("labels.homeSpot")} error={errorFor("homeSpot")}>
            {(id) => (
              <select
                id={id}
                value={values.homeSpot}
                onChange={(event) => update({ homeSpot: event.target.value })}
                disabled={spotOptions.length === 0}
                className={`${inputClass} bg-white disabled:bg-slate-50 disabled:text-slate-400`}
              >
                <option value="">{t("unselected")}</option>
                {spotOptions.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </Section>

        <Section title={t("sections.preferences")}>
          <GenreField
            label={t("labels.diningGenres")}
            options={genreOptions.dining}
            values={values.diningGenres}
            onChange={(next) => update({ diningGenres: next })}
            error={errorFor("diningGenres")}
          />
          <GenreField
            label={t("labels.leisureGenres")}
            options={genreOptions.leisure}
            values={values.leisureGenres}
            onChange={(next) => update({ leisureGenres: next })}
            error={errorFor("leisureGenres")}
          />
        </Section>

        <Section title={t("sections.budget")}>
          <Field label={t("labels.budget")} error={errorFor("budget")}>
            {(id) => (
              <>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values.budget}
                  onChange={(event) => update({ budget: event.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
                <Hint>{t("hints.budget")}</Hint>
              </>
            )}
          </Field>
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium">
              {t("labels.priority")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {priorities.map((option) => (
                <label
                  key={option}
                  className={`cursor-pointer rounded-lg px-3 py-2 text-sm ring-1 ring-inset transition ${
                    values.priority === option
                      ? "bg-blue-50 font-semibold text-[#185fa5] ring-blue-200"
                      : "bg-white text-slate-600 ring-[#e5e8ec] hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={option}
                    checked={values.priority === option}
                    onChange={() => update({ priority: option })}
                    className="sr-only"
                  />
                  {t(`priorities.${option}`)}
                </label>
              ))}
              <button
                type="button"
                onClick={() => update({ priority: "" })}
                className="rounded-lg px-3 py-2 text-sm text-slate-500 underline"
              >
                {t("clearPriority")}
              </button>
            </div>
            <Hint>{t("hints.priority")}</Hint>
          </fieldset>
        </Section>

        <Section title={t("sections.wallet")} description={t("hints.wallet")}>
          <Field
            label={t("labels.walletAddress")}
            error={errorFor("walletAddress")}
          >
            <WalletConnectField
              value={values.walletAddress}
              onChange={(address) => update({ walletAddress: address })}
            />
            <Hint>{t("hints.walletAddress")}</Hint>
          </Field>
        </Section>

        {/* 長いフォームなので、スクロールしても保存できるよう下端に貼り付ける */}
        <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-4 border-t border-[#e5e8ec] bg-white px-6 py-4 sm:-mx-8 sm:px-8">
          {status === "saved" && !isDirty && (
            <p className="text-sm text-slate-600">{t("saved")}</p>
          )}
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-lg bg-[#185fa5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#144e88] disabled:opacity-60"
          >
            {status === "saving" ? t("saving") : t("save")}
          </button>
        </div>
      </form>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <ProfileReadiness
          birthDate={values.birthDate}
          residencePref={values.residencePref}
          homeCity={values.homeCity}
          homeSpot={values.homeSpot}
          budget={values.budget}
          priority={values.priority}
          walletAddress={values.walletAddress}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 border-b border-[#e5e8ec] pb-8 last-of-type:border-b-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description !== undefined && (
        <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
      )}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-5 text-slate-500">{children}</p>;
}

/**
 * 入力欄1つ分
 *
 * `children` に関数を渡すと、ラベルと結ぶための id を受け取れる
 */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode | ((id: string) => React.ReactNode);
}) {
  const id = useId();

  return (
    <div>
      {typeof children === "function" ? (
        <>
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
            {label}
          </label>
          {children(id)}
        </>
      ) : (
        <>
          <p className="mb-1.5 block text-sm font-medium">{label}</p>
          {children}
        </>
      )}
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}

/**
 * 好み・趣味の入力
 *
 * 候補は DB のジャンルから出すが、まだ登録の無いジャンルも先に入れられるよう自由入力も許す
 */
function GenreField({
  label,
  options,
  values,
  onChange,
  error,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
  error: string | null;
}) {
  const t = useTranslations("ProfileSettings");
  const [draft, setDraft] = useState("");
  const isFull = values.length >= MAX_GENRES;

  const add = (value: string) => {
    const trimmed = value.trim();

    if (trimmed === "" || values.includes(trimmed) || isFull) {
      return;
    }

    onChange([...values, trimmed]);
    setDraft("");
  };

  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((current) => current !== value));
      return;
    }

    add(value);
  };

  const extras = values.filter((value) => !options.includes(value));

  return (
    <Field label={label} error={error}>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = values.includes(option);

          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={isSelected}
              disabled={!isSelected && isFull}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 ring-inset transition disabled:opacity-50 ${
                isSelected
                  ? "bg-blue-50 font-semibold text-[#185fa5] ring-blue-200"
                  : "bg-white text-slate-600 ring-[#e5e8ec] hover:bg-slate-50"
              }`}
            >
              {option}
            </button>
          );
        })}
        {extras.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#185fa5] ring-1 ring-inset ring-blue-200"
          >
            {value}
            <button
              type="button"
              onClick={() => toggle(value)}
              aria-label={t("removeGenre", { genre: value })}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(draft);
            }
          }}
          maxLength={40}
          disabled={isFull}
          placeholder={t("genrePlaceholder")}
          aria-label={t("addGenre")}
          className={`${inputClass} max-w-56 disabled:bg-slate-50`}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={isFull}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-[#185fa5] ring-1 ring-inset ring-[#e5e8ec] transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          {t("addGenre")}
        </button>
      </div>
      <Hint>{t("hints.genres", { max: MAX_GENRES })}</Hint>
    </Field>
  );
}
