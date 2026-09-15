"use client";

import { Building2, MapPin, Search, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type {
  ServiceCategory,
  VerificationKind,
} from "@/features/services/constants";
import {
  categoryPriceUnits,
  serviceCategories,
} from "@/features/services/constants";
import type { ServiceListItemDto } from "@/features/services/schemas";
import { serviceListResponseSchema } from "@/features/services/schemas";
import { categoryIcons } from "./category-icons";
import { ServiceDetail } from "./service-detail";

const priceFormatter = new Intl.NumberFormat();

type ServiceManagerProps = {
  initialServices: ServiceListItemDto[];
  initialSelectedServiceId?: string;
  supportedCities: string[];
};

type ServiceGroup = {
  category: ServiceCategory;
  items: ServiceListItemDto[];
};

export function ServiceManager({
  initialServices,
  initialSelectedServiceId,
  supportedCities,
}: ServiceManagerProps) {
  const t = useTranslations("ServiceManagement");
  const [services, setServices] = useState(initialServices);
  const [selectedServiceId, setSelectedServiceId] = useState(
    initialSelectedServiceId,
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ServiceCategory | "all">("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (query === "" && category === "all" && !includeInactive) {
      setServices(initialServices);
      setLoadFailed(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadFailed(false);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category !== "all") params.set("category", category);
      if (includeInactive) params.set("active", "all");

      try {
        const response = await fetch(`/api/services?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = serviceListResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success) throw new Error("Invalid service list response");
        setServices(parsed.data.data);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [category, includeInactive, initialServices, query]);

  const selectedService = useMemo(
    () => services.find(({ id }) => id === selectedServiceId),
    [selectedServiceId, services],
  );

  // 種別ごとにまとめる。見出しが種別を示すので、行からは種別バッジを外している
  const groups = useMemo<ServiceGroup[]>(
    () =>
      serviceCategories
        .map((value) => ({
          category: value,
          items: services.filter((service) => service.category === value),
        }))
        .filter((group) => group.items.length > 0),
    [services],
  );

  const selectService = (id: string) => {
    setSelectedServiceId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("service", id);
    window.history.replaceState(null, "", url);
  };

  const categoryLabel = (value: ServiceCategory) => t(`categories.${value}`);

  const verificationLabel = (
    kind: VerificationKind,
    ageLimit: number | null,
  ) =>
    kind === "age" && ageLimit !== null
      ? t("verifications.ageWithLimit", { limit: ageLimit })
      : t(`verifications.${kind}`);

  /** 行のバッジは狭いので、内訳は title で補う */
  const verificationSummary = (service: ServiceListItemDto) =>
    service.requiredVerifications
      .map((kind) => verificationLabel(kind, service.ageLimit))
      .join(" / ");

  /** 場所系は都市が同じ行ばかりになるので、最寄り駅からの時間を出す */
  const subLocation = (service: ServiceListItemDto) =>
    service.station !== null && service.stationAccessMin !== null
      ? t("stationAccess", {
          station: service.station,
          minutes: service.stationAccessMin,
        })
      : service.location;

  // 高さは固定せず本文と一緒に伸ばす。一覧はページのスクロールで読み、
  // 詳細は右の列で sticky にして画面から出ないようにする
  return (
    <div className="grid rounded-2xl border border-[#e5e8ec] bg-white shadow-sm md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex flex-col border-b border-[#e5e8ec] md:border-r md:border-b-0">
        {/* 検索と絞り込みは一覧をスクロールしても操作できるよう貼り付ける */}
        <div className="bg-white md:sticky md:top-0 md:z-20">
          <div className="border-b border-[#e5e8ec] p-4">
            <label className="relative block">
              <span className="sr-only">{t("search")}</span>
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-lg border border-[#e5e8ec] py-2 pr-3 pl-9 text-sm outline-none transition focus:border-[#185fa5] focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="mt-3 flex items-center gap-3">
              <select
                aria-label={t("categoryFilter")}
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ServiceCategory | "all")
                }
                className="min-w-0 flex-1 rounded-lg border border-[#e5e8ec] bg-white px-3 py-2 text-sm"
              >
                <option value="all">{t("allCategories")}</option>
                {serviceCategories.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)}
                  </option>
                ))}
              </select>
              <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                  className="size-4 accent-[#185fa5]"
                />
                {t("includeInactive")}
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-[#e5e8ec] px-4 py-3 text-xs text-slate-500">
            <span>{t("resultCount", { count: services.length })}</span>
            {isLoading && <span>{t("loading")}</span>}
          </div>
        </div>

        {/* 狭い画面は詳細が一覧の下に回るので、一覧の高さを抑えてスクロールさせる。
            md 以上はページのスクロールに任せる (でないと右の sticky が効かない) */}
        <div className="max-h-[60vh] overflow-y-auto md:max-h-none md:overflow-visible">
          {loadFailed ? (
            <p className="p-6 text-center text-sm text-red-700">
              {t("loadFailed")}
            </p>
          ) : services.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              {t("empty")}
            </p>
          ) : (
            groups.map((group) => {
              const Icon = categoryIcons[group.category];

              return (
                <section key={group.category}>
                  <h3 className="flex items-center justify-between gap-2 border-b border-[#e5e8ec] bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Icon className="size-3.5 text-[#185fa5]" />
                      {categoryLabel(group.category)}
                    </span>
                    <span className="font-normal text-slate-500 tabular-nums">
                      {t("resultCount", { count: group.items.length })}
                    </span>
                  </h3>
                  <ul>
                    {group.items.map((service) => {
                      const isSelected = service.id === selectedServiceId;
                      const hasVerifications =
                        service.requiredVerifications.length > 0;

                      return (
                        <li
                          key={service.id}
                          className="border-b border-[#e5e8ec] last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => selectService(service.id)}
                            aria-current={isSelected}
                            className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
                              isSelected
                                ? "bg-blue-50 ring-1 ring-inset ring-blue-100"
                                : ""
                            }`}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span
                                title={service.name}
                                className="truncate text-sm font-semibold"
                              >
                                {service.name}
                              </span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums">
                                {priceFormatter.format(service.price)}
                                <span className="ml-0.5 text-xs font-normal text-slate-500">
                                  /
                                  {t(
                                    `units.${categoryPriceUnits[service.category]}`,
                                  )}
                                </span>
                              </span>
                            </span>
                            <span className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                              <span className="flex min-w-0 flex-1 items-center gap-1">
                                <MapPin className="size-3 shrink-0" />
                                <span className="truncate">
                                  {subLocation(service)}
                                </span>
                              </span>
                              {hasVerifications && (
                                <span
                                  title={verificationSummary(service)}
                                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
                                >
                                  <ShieldCheck className="size-3" />
                                  <span className="sr-only">
                                    {verificationSummary(service)}
                                  </span>
                                  {service.ageLimit !== null && (
                                    <span
                                      aria-hidden="true"
                                      className="tabular-nums"
                                    >
                                      {service.ageLimit}+
                                    </span>
                                  )}
                                </span>
                              )}
                              {!service.active && (
                                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">
                                  {t("inactive")}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {/* 一覧をスクロールしても内容が画面から出ないよう貼り付ける。
            詳細が画面より高いときはこの中だけをスクロールさせる */}
        <div className="mx-auto w-full max-w-3xl md:sticky md:top-6 md:max-h-[calc(100dvh-4rem)] md:overflow-y-auto">
          {selectedService ? (
            <ServiceDetail key={selectedService.id} service={selectedService} />
          ) : (
            <div className="mx-auto max-w-sm py-8 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Building2 className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{t("selectTitle")}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {t("selectDescription")}
              </p>
              {supportedCities.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {supportedCities.map((city) => (
                    <span
                      key={city}
                      className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-[#185fa5]"
                    >
                      {city}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
