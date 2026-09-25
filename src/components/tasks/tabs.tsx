"use client";

import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import type { TasksTab } from "./query";
import { tasksHref } from "./query";

// 表示順 (検知が既定で左)
const TABS = ["detect", "trips"] as const satisfies readonly TasksTab[];

type TabsProps = {
  active: TasksTab;

  /** 表示中のタブの中身 (Server Component が描いたもの) */
  children: ReactNode;
};

/**
 * 検知と確定旅程を切り替えるタブ行と、表示中のタブの中身
 *
 * タブはリンクで、表示は URL が持つ (`/tasks` と `/tasks?tab=trips`)
 * 押すと Link が遷移し、Server Component が新しい `active` で描き直す (戻るボタンも URL に従う)
 * Base UI の Tabs には role と矢印キーの移動だけを任せ、`onValueChange` は渡さない (Link と二重に遷移させない)
 */
export const TasksTabs = ({ active, children }: TabsProps): ReactElement => {
  const t = useTranslations("TasksPage");

  // タブ行と中身の間、中身の区画どうしの間は、枠 (TasksShell) の gap-5 と同じにする
  return (
    <Tabs value={active} className="gap-5">
      <TabsList aria-label={t("tabs.label")}>
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            nativeButton={false}
            render={<Link href={tasksHref({ tab, scan: false })} />}
          >
            {t(`tabs.${tab}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={active} className="flex flex-col gap-5">
        {children}
      </TabsContent>
    </Tabs>
  );
};
