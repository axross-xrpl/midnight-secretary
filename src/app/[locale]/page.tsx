import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { emptyStateClass, sectionLabelClass } from "@/components/chat/styles";
import { BalanceCard } from "@/components/home/balance-card";
import { ConfirmedTripBoard } from "@/components/home/confirmed-trip-board";
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-[22px] px-[26px] pb-[26px]">
        <header>
          <h1 className="text-[17px] font-bold">{title}</h1>
        </header>
        {children}
      </div>
    </div>
  );
};

/**
 * ホーム (上段が保有トークンの残高、下段が確定した旅程の一覧)
 *
 * どちらもサインイン中のユーザのものなので、未サインインでは案内だけを出す
 * (この画面自体がサインインの入口なので、他の画面のようにトップへ送らない)
 */
const HomePage = async (): Promise<ReactElement> => {
  const t = await getTranslations("Home");
  const user = await getApiSessionUser();

  if (user === null) {
    return (
      <HomeShell title={t("title")}>
        <p className={emptyStateClass}>{t("signedOut")}</p>
      </HomeShell>
    );
  }

  const [balance, trips] = await Promise.all([
    readMstBalance(),
    loadConfirmedTrips(user.userId),
  ]);

  return (
    <HomeShell title={t("title")}>
      <section className="flex flex-col gap-2">
        <h2 className={sectionLabelClass}>{t("balance.section")}</h2>
        <BalanceCard balance={balance} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={sectionLabelClass}>{t("trips.title")}</h2>
        <ConfirmedTripBoard trips={trips} />
      </section>
    </HomeShell>
  );
};

export default HomePage;
