import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { Link } from "@/i18n/navigation";
import type { TasksTab } from "./query";
import { tasksHref } from "./query";
import { activeTabClass, idleTabClass, tabRowClass } from "./styles";

// 表示順 (検知が既定で左)
const TABS = ["detect", "trips"] as const satisfies readonly TasksTab[];

type TabsProps = {
  active: TasksTab;
};

/**
 * 検知と確定旅程を切り替えるタブ行
 *
 * タブはリンクで、表示は URL が持つ (`/tasks` と `/tasks?tab=trips`)
 * 表示中のタブに `aria-current="page"` を付ける
 */
export const TasksTabs = async ({
  active,
}: TabsProps): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");

  return (
    <nav aria-label={t("tabs.label")} className={tabRowClass}>
      {TABS.map((tab) => (
        <Link
          key={tab}
          href={tasksHref({ tab, scan: false })}
          className={tab === active ? activeTabClass : idleTabClass}
          aria-current={tab === active ? "page" : undefined}
        >
          {t(`tabs.${tab}`)}
        </Link>
      ))}
    </nav>
  );
};
