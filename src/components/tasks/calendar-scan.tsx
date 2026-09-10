"use client";

import type { DateTimeFormatOptions } from "next-intl";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";
import type {
  ScanErrorKind,
  ScanEvent,
  ScanEventTime,
  ScanResponse,
} from "@/lib/calendar-scan-response";
import { requestScan } from "./request-scan";

/**
 * スキャンの進み具合
 */
export type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "scanned"; result: ScanResponse }
  | { status: "failed"; error: ScanErrorKind };

const buttonClass =
  "rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200";

const mutedClass = "text-sm text-zinc-600 dark:text-zinc-400";

const toDate = (when: ScanEventTime): Date => {
  if (when.kind === "allDay") {
    return new Date(when.startDate);
  }

  return new Date(when.start);
};

// 終日の予定は日付だけの文字列なので、時差で前日にずれないよう UTC のまま表示する
const dateTimeOptions = (when: ScanEventTime): DateTimeFormatOptions => {
  if (when.kind === "allDay") {
    return { dateStyle: "medium", timeZone: "UTC" };
  }

  return { dateStyle: "medium", timeStyle: "short" };
};

type EventRowProps = {
  event: ScanEvent;
};

const EventRow = ({ event }: EventRowProps): ReactElement => {
  const t = useTranslations("CalendarScan");
  const format = useFormatter();
  const when = format.dateTime(toDate(event.when), dateTimeOptions(event.when));

  return (
    <li className="flex flex-col gap-0.5 py-3">
      <span className="font-medium">
        {event.title === "" ? t("noTitle") : event.title}
      </span>
      <span className={mutedClass}>
        {when} · {event.location ?? t("noLocation")}
      </span>
    </li>
  );
};

type EventListProps = {
  events: readonly ScanEvent[];
};

const EventList = ({ events }: EventListProps): ReactElement => {
  const t = useTranslations("CalendarScan");

  if (events.length === 0) {
    return <p className={mutedClass}>{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className={mutedClass}>{t("count", { count: events.length })}</p>
      <ul className="flex flex-col divide-y divide-black/8 dark:divide-white/[.145]">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
    </div>
  );
};

/**
 * カレンダースキャン
 *
 * ボタンを押すと Google カレンダーの今後 30 日の予定を読み、そのまま一覧にする
 */
export const CalendarScan = (): ReactElement => {
  const t = useTranslations("CalendarScan");
  const [state, setState] = useState<ScanState>({ status: "idle" });

  const startScan = async (): Promise<void> => {
    setState({ status: "scanning" });
    const result = await requestScan(fetch);
    setState(
      result.ok
        ? { status: "scanned", result: result.value }
        : { status: "failed", error: result.error },
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={state.status === "scanning"}
          onClick={startScan}
        >
          {state.status === "scanning" ? t("scanning") : t("scan")}
        </button>
        <span className={mutedClass}>{t("helper")}</span>
      </div>
      {state.status === "failed" ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {t(`errors.${state.error}`)}
        </p>
      ) : undefined}
      {state.status === "scanned" ? (
        <EventList events={state.result.events} />
      ) : undefined}
    </section>
  );
};
