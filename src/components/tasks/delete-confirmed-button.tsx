"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState, useTransition } from "react";
import { match } from "ts-pattern";
import {
  smallDangerButtonClass,
  smallDangerGhostButtonClass,
  smallGhostButtonClass,
} from "@/components/chat/styles";
import { useRouter } from "@/i18n/navigation";
import { requestDeleteConfirmedTrip } from "./request-confirmed";

/**
 * 削除ボタンの状態
 *
 * 誤操作で消えないよう、押してから「削除する」でもう一度確かめる
 */
type DeleteState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "deleting" };

type Props = {
  tripId: string;
};

/**
 * 確定旅程を 1 件消すボタン
 *
 * 最初は「削除」で、押すと「削除する」と「やめる」に変わる
 * 消せたら `router.refresh()` で一覧を読み直し、失敗したら「削除」に戻す
 */
export const DeleteConfirmedButton = ({ tripId }: Props): ReactElement => {
  const t = useTranslations("TasksPage");
  const router = useRouter();
  const [state, setState] = useState<DeleteState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  // 文言を出す場所が無いので、失敗しても最初の「削除」に戻すだけ
  const runDelete = async (): Promise<void> => {
    const deleted = await requestDeleteConfirmedTrip(fetch, tripId);

    setState({ kind: "idle" });

    if (!deleted.ok) {
      return;
    }

    router.refresh();
  };

  const handleDelete = (): void => {
    setState({ kind: "deleting" });
    startTransition(runDelete);
  };

  return match(state)
    .returnType<ReactElement>()
    .with({ kind: "idle" }, () => (
      <button
        type="button"
        className={smallDangerGhostButtonClass}
        onClick={() => setState({ kind: "confirming" })}
      >
        {t("deleteConfirmed")}
      </button>
    ))
    .with({ kind: "confirming" }, { kind: "deleting" }, () => (
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={smallDangerButtonClass}
          disabled={isPending}
          aria-busy={isPending}
          onClick={handleDelete}
        >
          {t("deleteConfirmedConfirm")}
        </button>
        <button
          type="button"
          className={smallGhostButtonClass}
          disabled={isPending}
          onClick={() => setState({ kind: "idle" })}
        >
          {t("deleteConfirmedCancel")}
        </button>
      </span>
    ))
    .exhaustive();
};
