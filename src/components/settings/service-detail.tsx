"use client";

import { RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { categoryPriceUnits } from "@/features/services/constants";
import type {
  DoorToDoorBreakdown,
  TransportLeg,
} from "@/features/services/door-to-door";
import { doorToDoor, toDurationParts } from "@/features/services/door-to-door";
import type {
  PlaceServiceDetailDto,
  ServiceDetailDto,
  ServiceListItemDto,
  TransportServiceDetailDto,
} from "@/features/services/schemas";
import { categoryIcons } from "./category-icons";
import type { ServiceDetailErrorKind } from "./request-service-detail";
import { requestServiceDetail } from "./request-service-detail";

const priceFormatter = new Intl.NumberFormat();

/** time 型は "HH:MM:SS" で来るので時分に切る */
const hourMinute = (value: string | null): string | null => {
  return value === null ? null : value.slice(0, 5);
};

const timeRange = (from: string | null, to: string | null): string | null => {
  const start = hourMinute(from);
  const end = hourMinute(to);

  if (start === null && end === null) {
    return null;
  }

  return `${start ?? ""} – ${end ?? ""}`.trim();
};

type FieldProps = {
  label: string;
  children: ReactNode;
};

const Field = ({ label, children }: FieldProps): ReactElement => {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{children}</dd>
    </div>
  );
};

type SectionProps = {
  title: string;
  children: ReactNode;
};

const Section = ({ title, children }: SectionProps): ReactElement => {
  return (
    <section className="border-t border-[#e5e8ec] pt-5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h4>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
};

/**
 * 内訳の帯
 *
 * 乗車時間より前後の移動と待ちが長いことが、数字を読まなくても分かるようにする
 */
const breakdownColors = {
  originAccessMin: "bg-slate-300",
  boardingBufferMin: "bg-slate-400",
  durationMin: "bg-[#185fa5]",
  arrivalBufferMin: "bg-slate-400",
  destinationAccessMin: "bg-slate-300",
} satisfies Record<keyof DoorToDoorBreakdown, string>;

const breakdownLabels = {
  originAccessMin: "originAccess",
  boardingBufferMin: "boardingBuffer",
  durationMin: "ride",
  arrivalBufferMin: "arrivalBuffer",
  destinationAccessMin: "destinationAccess",
} as const satisfies Record<keyof DoorToDoorBreakdown, string>;

const breakdownOrder = [
  "originAccessMin",
  "boardingBufferMin",
  "durationMin",
  "arrivalBufferMin",
  "destinationAccessMin",
] as const;

type DoorToDoorPanelProps = {
  service: TransportServiceDetailDto;
};

const DoorToDoorPanel = ({
  service,
}: DoorToDoorPanelProps): ReactElement | undefined => {
  const t = useTranslations("ServiceManagement");
  const leg: TransportLeg = service;
  const { totalMin, totalPrice, breakdown } = doorToDoor(leg);

  if (totalMin === 0) {
    return undefined;
  }

  const { hours, minutes } = toDurationParts(totalMin);
  const duration =
    hours === 0
      ? t("detail.durationMinutes", { minutes })
      : t("detail.duration", { hours, minutes });

  return (
    <div className="mt-6 rounded-xl bg-slate-50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("detail.doorToDoor")}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{duration}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">{t("detail.total")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {priceFormatter.format(totalPrice)} MST
          </p>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-200"
      >
        {breakdownOrder.map((key) => {
          const value = breakdown[key];

          return value === 0 ? undefined : (
            <span
              key={key}
              className={breakdownColors[key]}
              style={{ width: `${(value / totalMin) * 100}%` }}
            />
          );
        })}
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {breakdownOrder.map((key) => (
          <li
            key={key}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${breakdownColors[key]}`}
              />
              <span className="truncate">
                {t(`detail.breakdown.${breakdownLabels[key]}`)}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-900">
              {t("detail.durationMinutes", { minutes: breakdown[key] })}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        {t("detail.doorToDoorNote")}
      </p>
    </div>
  );
};

type VerificationsProps = {
  requiredVerifications: readonly ("age" | "nationality" | "residence")[];
  ageLimit: number | null;
};

/**
 * 要求する本人確認
 *
 * 提案の候補から外れる条件なので、詳細を開いたときに目に入る位置に出す
 */
const Verifications = ({
  requiredVerifications,
  ageLimit,
}: VerificationsProps): ReactElement | undefined => {
  const t = useTranslations("ServiceManagement");

  if (requiredVerifications.length === 0) {
    return undefined;
  }

  return (
    <section className="border-t border-[#e5e8ec] pt-5">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <ShieldCheck className="size-3.5" />
        {t("detail.verifications")}
      </h4>
      <ul className="mt-3 flex flex-wrap gap-2">
        {requiredVerifications.map((kind) => (
          <li
            key={kind}
            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
          >
            {kind === "age" && ageLimit !== null
              ? t("verifications.ageWithLimit", { limit: ageLimit })
              : t(`verifications.${kind}`)}
          </li>
        ))}
      </ul>
    </section>
  );
};

type TransportFieldsProps = {
  service: TransportServiceDetailDto;
};

const TransportFields = ({ service }: TransportFieldsProps): ReactElement => {
  const t = useTranslations("ServiceManagement");
  const schedule = timeRange(service.departTime, service.arriveTime);

  return (
    <>
      <DoorToDoorPanel service={service} />
      <div className="mt-6 flex flex-col gap-5">
        <Section title={t("detail.section.route")}>
          <Field label={t("detail.route")}>
            {service.fromSpot} → {service.toSpot}
          </Field>
          <Field label={t("detail.cities")}>
            {service.fromCity} → {service.toCity}
          </Field>
          {schedule === null ? undefined : (
            <Field label={t("detail.schedule")}>
              <span className="tabular-nums">{schedule}</span>
            </Field>
          )}
          <Field label={t("detail.rideTime")}>
            <span className="tabular-nums">
              {t("detail.durationMinutes", { minutes: service.durationMin })}
            </span>
          </Field>
          {service.seatClass === null ? undefined : (
            <Field label={t("detail.seatClass")}>{service.seatClass}</Field>
          )}
        </Section>

        <Section title={t("detail.section.price")}>
          <Field label={t("detail.fare")}>
            <span className="tabular-nums">
              {priceFormatter.format(service.price)} MST
            </span>
          </Field>
          {service.accessFare === null ? undefined : (
            <Field label={t("detail.accessFare")}>
              <span className="tabular-nums">
                {priceFormatter.format(service.accessFare)} MST
              </span>
            </Field>
          )}
        </Section>
      </div>
    </>
  );
};

type PlaceFieldsProps = {
  service: PlaceServiceDetailDto;
};

const PlaceFields = ({ service }: PlaceFieldsProps): ReactElement => {
  const t = useTranslations("ServiceManagement");
  const openHours = timeRange(service.openFrom, service.openTo);
  const unit = t(`units.${categoryPriceUnits[service.kind]}`);

  return (
    <div className="mt-6 flex flex-col gap-5">
      <Section title={t("detail.section.overview")}>
        {service.itemName === null ? undefined : (
          <Field
            label={
              service.kind === "hotel" ? t("detail.plan") : t("detail.itemName")
            }
          >
            {service.itemName}
          </Field>
        )}
        {service.genre === null ? undefined : (
          <Field label={t("detail.genre")}>{service.genre}</Field>
        )}
        <Field label={t("price")}>
          <span className="tabular-nums">
            {priceFormatter.format(service.price)} MST
          </span>
          <span className="ml-1 text-xs font-normal text-slate-500">
            / {unit}
          </span>
        </Field>
        {service.rating === null ? undefined : (
          <Field label={t("detail.rating")}>
            <span className="tabular-nums">{service.rating.toFixed(1)}</span>
            <span className="text-xs font-normal text-slate-500"> / 5.0</span>
          </Field>
        )}
      </Section>

      <Section title={t("detail.section.access")}>
        <Field label={t("detail.city")}>{service.city}</Field>
        <Field label={t("detail.address")}>{service.address}</Field>
        <Field label={t("detail.stationAccessLabel")}>
          {t("stationAccess", {
            station: service.nearestStation,
            minutes: service.stationAccessMin,
          })}
        </Field>
      </Section>

      {service.kind === "hotel" &&
      (service.checkinFrom !== null ||
        service.checkoutBy !== null ||
        service.breakfastIncluded !== null) ? (
        <Section title={t("detail.section.stay")}>
          {service.checkinFrom === null ? undefined : (
            <Field label={t("detail.checkin")}>
              <span className="tabular-nums">
                {hourMinute(service.checkinFrom)}
              </span>
            </Field>
          )}
          {service.checkoutBy === null ? undefined : (
            <Field label={t("detail.checkout")}>
              <span className="tabular-nums">
                {hourMinute(service.checkoutBy)}
              </span>
            </Field>
          )}
          {service.breakfastIncluded === null ? undefined : (
            <Field label={t("detail.breakfast")}>
              {service.breakfastIncluded ? t("detail.yes") : t("detail.no")}
            </Field>
          )}
        </Section>
      ) : undefined}

      {openHours !== null ||
      service.hasAlcohol !== null ||
      service.seats !== null ? (
        <Section title={t("detail.section.hours")}>
          {openHours === null ? undefined : (
            <Field label={t("detail.hours")}>
              <span className="tabular-nums">{openHours}</span>
            </Field>
          )}
          {service.hasAlcohol === null ? undefined : (
            <Field label={t("detail.alcohol")}>
              {service.hasAlcohol ? t("detail.yes") : t("detail.no")}
            </Field>
          )}
          {service.seats === null ? undefined : (
            <Field label={t("detail.seats")}>{service.seats}</Field>
          )}
        </Section>
      ) : undefined}
    </div>
  );
};

/**
 * 読み込み中の骨組み
 *
 * 高さを実際の内容に近づけて、表示が入れ替わったときの跳ねを小さくする
 */
const DetailSkeleton = (): ReactElement => {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 w-16 rounded bg-slate-100" />
          <div className="h-5 w-2/3 rounded bg-slate-100" />
          <div className="h-3 w-24 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mt-6 h-28 rounded-xl bg-slate-50" />
      <div className="mt-6 space-y-4 border-t border-[#e5e8ec] pt-5">
        <div className="h-3 w-20 rounded bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-9 rounded bg-slate-50" />
          <div className="h-9 rounded bg-slate-50" />
          <div className="h-9 rounded bg-slate-50" />
          <div className="h-9 rounded bg-slate-50" />
        </div>
      </div>
    </div>
  );
};

type DetailState =
  | { status: "loading" }
  | { status: "loaded"; detail: ServiceDetailDto }
  | { status: "failed"; error: ServiceDetailErrorKind };

type ServiceDetailProps = {
  /** 一覧の行。名称と種別は取得を待たずに出せる */
  service: ServiceListItemDto;
};

/**
 * サービスの内容
 *
 * 一覧が持つのは種別・名称・価格・場所だけなので、詳細は種別ごとの
 * Route Handler から読み直して種別固有の項目まで出す
 */
export const ServiceDetail = ({
  service,
}: ServiceDetailProps): ReactElement => {
  const t = useTranslations("ServiceManagement");
  const [state, setState] = useState<DetailState>({ status: "loading" });
  // 選択を素早く切り替えたときに古い応答で上書きしないよう、要求に世代番号を振る
  const generation = useRef(0);
  const Icon = categoryIcons[service.category];

  const load = useCallback(async () => {
    generation.current += 1;
    const requested = generation.current;
    setState({ status: "loading" });

    const result = await requestServiceDetail(
      fetch,
      service.category,
      service.id,
    );

    if (generation.current !== requested) {
      return;
    }

    setState(
      result.ok
        ? { status: "loaded", detail: result.value }
        : { status: "failed", error: result.error },
    );
  }, [service.category, service.id]);

  useEffect(() => {
    load();

    // 破棄したら以後の応答は捨てる
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const isActive =
    state.status === "loaded" ? state.detail.service.active : service.active;

  return (
    <div className="w-full rounded-2xl border border-[#e5e8ec] p-6">
      <div className="flex items-start gap-4">
        <span className="rounded-xl bg-blue-50 p-3 text-[#185fa5]">
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#185fa5]">
              {t(`categories.${service.category}`)}
            </p>
            {isActive ? undefined : (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                {t("inactive")}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-xl font-semibold">{service.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{service.code}</p>
        </div>
      </div>

      {state.status === "loading" ? (
        <div className="mt-6">
          <DetailSkeleton />
          <p className="sr-only" aria-live="polite">
            {t("detail.loading")}
          </p>
        </div>
      ) : undefined}

      {state.status === "failed" ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p>
            {state.error === "notFound"
              ? t("detail.notFound")
              : t("detail.failed")}
          </p>
          {state.error === "failed" ? (
            <button
              type="button"
              onClick={load}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 transition hover:bg-red-100"
            >
              <RotateCcw className="size-3.5" />
              {t("detail.retry")}
            </button>
          ) : undefined}
        </div>
      ) : undefined}

      {state.status === "loaded" ? (
        <>
          {state.detail.kind === "transport" ? (
            <TransportFields service={state.detail.service} />
          ) : (
            <PlaceFields service={state.detail.service} />
          )}
          {state.detail.kind === "place" ? (
            <div className="mt-5">
              <Verifications
                requiredVerifications={
                  state.detail.service.requiredVerifications
                }
                ageLimit={state.detail.service.ageLimit}
              />
            </div>
          ) : undefined}
          <section className="mt-5 border-t border-[#e5e8ec] pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("detail.walletAddress")}
            </h4>
            <p className="mt-2 font-mono text-xs break-all text-slate-600">
              {state.detail.service.walletAddress}
            </p>
          </section>
        </>
      ) : undefined}
    </div>
  );
};
