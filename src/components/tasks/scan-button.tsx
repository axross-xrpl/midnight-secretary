"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useTransition } from "react";
import { primaryButtonClass } from "@/components/chat/styles";
import { useRouter } from "@/i18n/navigation";
import { parseTasksQuery, tasksHref } from "./query";

/**
 * カレンダーをスキャンするボタン
 *
 * 押すと `/tasks?scan=1` へ移り、Server Component がカレンダーの 30 日の窓を読む
 * すでにスキャン済みの URL なら `router.refresh()` で読み直す
 * 読み込みが終わるまでは押せない
 */
export const ScanButton = (): ReactElement => {
  const t = useTranslations("TasksPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // 同じ URL への push は Server Component を描き直さないので、スキャン済みなら refresh にする
  const handleClick = (): void => {
    const query = parseTasksQuery(Object.fromEntries(searchParams));

    if (query.scan) {
      startTransition(() => router.refresh());

      return;
    }

    startTransition(() =>
      router.push(tasksHref({ tab: "detect", scan: true })),
    );
  };

  return (
    <button
      type="button"
      className={primaryButtonClass}
      disabled={isPending}
      aria-busy={isPending}
      onClick={handleClick}
    >
      {t("scan")}
    </button>
  );
};
