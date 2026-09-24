import { getTranslations } from "next-intl/server";
import { ServiceManager } from "@/components/settings/service-manager";
import { requireSession } from "@/lib/require-session";
import { settingsDeps } from "@/server/ports";
import {
  readServices,
  readSupportedCities,
} from "@/server/services/read-services";

export default async function ServicesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  await requireSession();
  const { catalog } = settingsDeps();

  const [{ service }, services, supportedCities, t] = await Promise.all([
    searchParams,
    readServices({}, catalog),
    readSupportedCities(catalog),
    getTranslations("ServiceManagement"),
  ]);

  return (
    <section className="flex flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-accent">{t("eyebrow")}</p>
        <h2 className="mt-1 font-serif text-2xl font-medium">{t("title")}</h2>
        <p className="mt-2 max-w-2xl text-base text-muted">
          {t("description")}
        </p>
      </div>
      <ServiceManager
        initialServices={services.map((item) => ({
          ...item,
          updatedAt: item.updatedAt.toISOString(),
        }))}
        initialSelectedServiceId={service}
        supportedCities={supportedCities}
      />
    </section>
  );
}
