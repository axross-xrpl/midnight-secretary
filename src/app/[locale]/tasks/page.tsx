import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { CalendarScan } from "@/components/tasks/calendar-scan";
import { requireSession } from "@/lib/require-session";

/**
 * Google カレンダーをスキャンして予定を確かめる画面
 */
const TasksPage = async (): Promise<ReactElement> => {
  await requireSession();
  const t = await getTranslations("TasksPage");

  return (
    <div className="flex flex-1 flex-col gap-6 bg-zinc-50 px-16 py-10 dark:bg-black">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <CalendarScan />
    </div>
  );
};

export default TasksPage;
