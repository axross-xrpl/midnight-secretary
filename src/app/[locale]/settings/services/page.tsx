import { getTranslations } from "next-intl/server";
import { ServiceManager } from "@/components/settings/service-manager";
import { requireSession } from "@/lib/require-session";
import { settingsDeps, valueOrThrow } from "@/server/settings/deps";

export default async function ServicesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  await requireSession();
  const deps = settingsDeps();

  const [{ service }, services, supportedCities, t] = await Promise.all([
    searchParams,
    deps.catalog.listServices({}).then(valueOrThrow),
    deps.catalog.listSupportedCities().then(valueOrThrow),
    getTranslations("ServiceManagement"),
  ]);

  return (
    <section className="flex flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#185fa5]">{t("eyebrow")}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {t("description")}
        </p>
      </div>
      <ServiceManager
        initialServices={services}
        initialSelectedServiceId={service}
        supportedCities={supportedCities}
      />
    </section>
  );
}
