import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";
import { secretaryContext } from "@/adapters/auth/session";
import { FailureNotice } from "@/components/dashboard/failure-notice";
import { SecretaryDashboard } from "@/components/dashboard/secretary-dashboard";
import { redirect } from "@/i18n/navigation";
import { loadDashboardData } from "@/server/secretary/dashboard-page";
import { serializableSecretaryError } from "@/server/secretary/responses";

type ShellProps = {
  title: string;
  children: ReactNode;
};

const DashboardShell = ({ title, children }: ShellProps): ReactElement => {
  return (
    <div className="flex flex-1 flex-col bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-[22px] px-[26px] pb-[26px]">
        <header className="flex flex-col gap-2">
          <h1 className="text-[17px] font-bold">{title}</h1>
        </header>
        {children}
      </div>
    </div>
  );
};

/**
 * サインイン中のユーザのダッシュボード (支払い枠、今後の予定、一本道、2 つの台帳)
 *
 * 読み取りはこの Server Component が use case を直接呼び、変更はクライアントが Route Handler を叩く
 */
const DashboardPage = async (): Promise<ReactElement> => {
  const context = await secretaryContext();

  if (!context.ok) {
    return redirect({ href: "/", locale: await getLocale() });
  }

  const t = await getTranslations("Dashboard");
  const data = await loadDashboardData(context.value);

  if (!data.ok) {
    return (
      <DashboardShell title={t("title")}>
        <FailureNotice
          failure={{
            code: "secretary",
            error: serializableSecretaryError(data.error),
          }}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={t("title")}>
      <SecretaryDashboard
        now={data.value.now}
        mandate={data.value.mandate}
        events={data.value.events}
        trips={data.value.trips}
        publicLedger={data.value.publicLedger}
      />
    </DashboardShell>
  );
};

export default DashboardPage;
