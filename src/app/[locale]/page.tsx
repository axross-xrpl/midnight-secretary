import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { DEV_PROVIDER_ID } from "@/adapters/auth/dev";
import { getSecretaryRuntime } from "@/adapters/runtime";
import { sectionLabelClass } from "@/components/chat/styles";
import { BalanceCard } from "@/components/home/balance-card";
import { ConfirmedTripBoard } from "@/components/home/confirmed-trip-board";
import { LandingHero } from "@/components/home/landing-hero";
import { getApiSessionUser } from "@/lib/api-session";
import { loadConfirmedTrips } from "@/server/trips/confirmed-trips";
import { readMstBalance } from "@/server/wallet/read-mst-balance";

type ShellProps = {
  title: string;
  children: React.ReactNode;
};

const HomeShell = ({ title, children }: ShellProps): ReactElement => {
  return (
    <div className="flex flex-1 flex-col bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-10 py-8">
        <header>
          <h1 className="font-serif text-2xl font-medium">{title}</h1>
        </header>
        {children}
      </div>
    </div>
  );
};

/**
 * ホーム (上段が保有トークンの残高、下段が確定した旅程の一覧)
 *
 * どちらもサインイン中のユーザのものなので、未サインインではヒーローだけを出す
 * (この画面自体がサインインの入口なので、他の画面のようにトップへ送らない)
 */
const HomePage = async (): Promise<ReactElement> => {
  const t = await getTranslations("Home");
  const user = await getApiSessionUser();

  if (user === null) {
    const { sources } = getSecretaryRuntime();
    const signInProvider = sources.auth === "dev" ? DEV_PROVIDER_ID : "google";

    return <LandingHero signInProvider={signInProvider} />;
  }

  const [balance, trips] = await Promise.all([
    readMstBalance(),
    loadConfirmedTrips(user.userId),
  ]);

  return (
    <HomeShell title={t("title")}>
      <section className="flex flex-col gap-3">
        <h2 className={sectionLabelClass}>{t("balance.section")}</h2>
        <BalanceCard balance={balance} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={sectionLabelClass}>{t("trips.title")}</h2>
        <ConfirmedTripBoard trips={trips} />
      </section>
    </HomeShell>
  );
};

export default HomePage;
