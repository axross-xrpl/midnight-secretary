import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";
import { match } from "ts-pattern";
import { secretaryContext } from "@/adapters/auth/session";
import { FailureNotice } from "@/components/chat/failure-notice";
import {
  emptyStateClass,
  labelClass,
  sectionLabelClass,
} from "@/components/chat/styles";
import { ActiveTripList } from "@/components/tasks/active-list";
import { CandidateList } from "@/components/tasks/candidate-list";
import { ConfirmedTripList } from "@/components/tasks/confirmed-list";
import type { TasksTab } from "@/components/tasks/query";
import { parseTasksQuery } from "@/components/tasks/query";
import {
  activeTripsOf,
  candidateEventsOf,
  confirmedTripsOf,
} from "@/components/tasks/rows";
import { ScanButton } from "@/components/tasks/scan-button";
import { TasksTabs } from "@/components/tasks/tabs";
import { redirect } from "@/i18n/navigation";
import { serializableSecretaryError } from "@/server/secretary/responses";
import type { TasksData } from "@/server/secretary/tasks-page";
import { loadTasksData } from "@/server/secretary/tasks-page";

type ShellProps = {
  title: string;
  tab: TasksTab;
  children: ReactNode;
};

// 読み込みに失敗してもタブは切り替えられるよう、タブ行は枠に置く
const TasksShell = ({ title, tab, children }: ShellProps): ReactElement => {
  return (
    <div className="flex flex-1 flex-col bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-[22px] px-[26px] pb-[26px]">
        <header>
          <h1 className="text-[17px] font-bold">{title}</h1>
        </header>
        <TasksTabs active={tab}>{children}</TasksTabs>
      </div>
    </div>
  );
};

type TabProps = {
  data: TasksData;
};

// 検知タブ (上から、スキャンのボタン、手配できる予定、手配中の出張)
// 支払い枠は会話画面のサイドバーで見せるので、ここでは出さない
const DetectTab = async ({ data }: TabProps): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <ScanButton />
        <p className={labelClass}>{t("scanHelper")}</p>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className={sectionLabelClass}>{t("candidates")}</h2>
        {match(data.scan)
          .with({ kind: "notScanned" }, () => (
            <p className={emptyStateClass}>{t("notScanned")}</p>
          ))
          .with({ kind: "scanned" }, ({ events }) => (
            <CandidateList
              events={candidateEventsOf(events, data.trips, data.confirmed)}
            />
          ))
          .exhaustive()}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={sectionLabelClass}>{t("active")}</h2>
        <ActiveTripList trips={activeTripsOf(data.trips)} />
      </section>
    </>
  );
};

// 確定旅程タブ (登録済みの trip を予定の開始順に)
const TripsTab = ({ data }: TabProps): ReactElement => {
  return <ConfirmedTripList trips={confirmedTripsOf(data.confirmed)} />;
};

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 予定一覧 (検知タブと確定旅程タブ)
 *
 * 表示は URL が持つ (`/tasks` = 検知、`/tasks?scan=1` = 検知でスキャン済み、`/tasks?tab=trips` = 確定旅程)
 * 読み取りはこの Server Component が use case を直接呼び、カレンダーはスキャン済みのときだけ読む
 * 予定の手配は行の「秘書に相談」から `/tasks/[eventId]` に移って進める
 */
const TasksPage = async ({
  searchParams,
}: TasksPageProps): Promise<ReactElement> => {
  const context = await secretaryContext();

  if (!context.ok) {
    return redirect({ href: "/", locale: await getLocale() });
  }

  const query = parseTasksQuery(await searchParams);
  const t = await getTranslations("TasksPage");
  const data = await loadTasksData(context.value, query);

  if (!data.ok) {
    return (
      <TasksShell title={t("title")} tab={query.tab}>
        <FailureNotice
          failure={{
            code: "secretary",
            error: serializableSecretaryError(data.error),
          }}
        />
      </TasksShell>
    );
  }

  const tasks = data.value;

  return (
    <TasksShell title={t("title")} tab={query.tab}>
      {match(query.tab)
        .with("detect", () => <DetectTab data={tasks} />)
        .with("trips", () => <TripsTab data={tasks} />)
        .exhaustive()}
    </TasksShell>
  );
};

export default TasksPage;
