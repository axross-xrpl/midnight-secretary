import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { SecretaryDashboard } from "@/components/dashboard/secretary-dashboard";
import { noteClass } from "@/components/dashboard/styles";
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
    <div className="flex flex-1 flex-col bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-[22px] px-[26px] pb-[26px]">
        <header className="flex flex-col gap-2">
          <div>
            <h1 className="text-[17px] font-bold">{t("title")}</h1>
            <p className="mt-[3px] text-[12.5px] text-muted">
              {t("welcome", { name: session.user?.name ?? "" })}
            </p>
          </div>
          <p className={noteClass}>{t("sampleNotice")}</p>
        </header>
        <SecretaryDashboard now={now} />
      </div>
    </div>
  );
};

export default DashboardPage;
