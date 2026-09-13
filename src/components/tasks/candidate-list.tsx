import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import {
  emptyStateClass,
  labelClass,
  rowCardClass,
  smallPrimaryButtonClass,
} from "@/components/chat/styles";
import { Link } from "@/i18n/navigation";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import { EventWhen } from "./event-when";
import { chatHref } from "./query";

type ItemProps = {
  event: ScanEvent;
};

const CandidateItem = async ({ event }: ItemProps): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");

  return (
    <li className={rowCardClass}>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">
          {event.title === "" ? t("noTitle") : event.title}
        </div>
        <div className={labelClass}>
          <EventWhen when={event.when} /> · {event.location ?? t("noLocation")}
        </div>
      </div>
      <Link href={chatHref(event.id)} className={smallPrimaryButtonClass}>
        {t("chat")}
      </Link>
    </li>
  );
};

type Props = {
  events: readonly ScanEvent[];
};

/**
 * 手配できる予定の一覧 (題名、日時、場所、「秘書に相談」)
 *
 * 行は `candidateEventsOf` が絞ったものをその順序で出す
 * 0 件なら空の箱
 */
export const CandidateList = async ({
  events,
}: Props): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");

  if (events.length === 0) {
    return <p className={emptyStateClass}>{t("noCandidates")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <CandidateItem key={event.id} event={event} />
      ))}
    </ul>
  );
};
