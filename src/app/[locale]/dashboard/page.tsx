import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { SecretaryDashboard } from "@/components/dashboard/secretary-dashboard";
import { requireSession } from "@/lib/require-session";

/**
 * The signed-in user's dashboard: mandate, upcoming events, the trip flow,
 * and the dual-ledger view.
 */
const DashboardPage = async (): Promise<ReactElement> => {
  const session = await requireSession();
  const t = await getTranslations("Dashboard");
  const now = new Date().toISOString();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {t("welcome", { name: session.user?.name ?? "" })}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {t("sampleNotice")}
          </p>
        </header>
        <SecretaryDashboard now={now} />
      </div>
    </div>
  );
};

export default DashboardPage;
