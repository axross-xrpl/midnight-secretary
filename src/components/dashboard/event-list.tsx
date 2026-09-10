"use client";

import type { DateTimeFormatOptions } from "next-intl";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import type { ScanEventTime } from "@/lib/calendar-scan-response";
import { inclusiveEndDate, statusPillClass } from "./format";
import {
  emptyStateClass,
  eventIcon,
  faintLabelClass,
  labelClass,
  noteClass,
  rowCardClass,
  sectionLabelClass,
  smallGhostButtonClass,
  smallPrimaryButtonClass,
} from "./styles";
import type { EventRow } from "./types";

// 終日の予定は日付だけの文字列なので、時差で前日にずれないよう UTC のまま出す
const ALL_DAY_OPTIONS: DateTimeFormatOptions = {
  dateStyle: "medium",
  timeZone: "UTC",
};

const TIMED_OPTIONS: DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

// next-intl の formatter のうち、この一覧が使う 2 つ
type WhenFormatter = {
  dateTime: (date: Date, options: DateTimeFormatOptions) => string;
  dateTimeRange: (
    start: Date,
    end: Date,
    options: DateTimeFormatOptions,
  ) => string;
};

// 終日の終了日は排他なので、最終日に直してから出す
const whenTextOf = (when: ScanEventTime, format: WhenFormatter): string => {
  if (when.kind === "timed") {
    return format.dateTimeRange(
      new Date(when.start),
      new Date(when.end),
      TIMED_OPTIONS,
    );
  }

  const lastDate = inclusiveEndDate(when.startDate, when.endDate);

  if (lastDate === when.startDate) {
    return format.dateTime(new Date(when.startDate), ALL_DAY_OPTIONS);
  }

  return format.dateTimeRange(
    new Date(when.startDate),
    new Date(lastDate),
    ALL_DAY_OPTIONS,
  );
};

type ItemProps = {
  row: EventRow;
  busy: boolean;
  canPropose: boolean;
  onPropose: (eventId: string) => void;
  onSelect: (eventId: string) => void;
  onIgnore: (eventId: string) => void;
};

const EventItem = ({
  row,
  busy,
  canPropose,
  onPropose,
  onSelect,
  onIgnore,
}: ItemProps): ReactElement => {
  const t = useTranslations("EventList");
  const format = useFormatter();
  const when = whenTextOf(row.event.when, format);
  const timing =
    row.event.when.kind === "allDay" ? `${when} (${t("allDay")})` : when;
  const detail =
    row.event.location === undefined
      ? timing
      : `${timing} · ${row.event.location}`;

  return (
    <li className={rowCardClass}>
      <span className="text-xl" aria-hidden="true">
        {eventIcon[row.state.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{row.event.title}</div>
        <div className={labelClass}>{detail}</div>
      </div>
      {match(row.state)
        .with({ kind: "unarranged" }, () => (
          <>
            <button
              type="button"
              className={smallPrimaryButtonClass}
              disabled={busy || !canPropose}
              onClick={() => onPropose(row.event.id)}
            >
              {t("propose")}
            </button>
            <button
              type="button"
              className={smallGhostButtonClass}
              disabled={busy}
              onClick={() => onIgnore(row.event.id)}
            >
              {t("ignore")}
            </button>
          </>
        ))
        .with({ kind: "arranged" }, ({ status }) => (
          <>
            <span className={statusPillClass[status]}>
              {t(`status.${status}`)}
            </span>
            <button
              type="button"
              className={smallGhostButtonClass}
              disabled={busy}
              onClick={() => onSelect(row.event.id)}
            >
              {t("show")}
            </button>
          </>
        ))
        .exhaustive()}
    </li>
  );
};

type Props = {
  rows: readonly EventRow[];
  ignoredCount: number;
  busy: boolean;
  canPropose: boolean;
  onPropose: (eventId: string) => void;
  onSelect: (eventId: string) => void;
  onIgnore: (eventId: string) => void;
  onRestore: () => void;
};

/**
 * 今後の予定を 1 行ずつ並べ、手配していない予定には提案のボタンを置く
 *
 * 手配済みの予定は状態のバッジと、ステッパーに出すボタンになる
 */
export const EventList = ({
  rows,
  ignoredCount,
  busy,
  canPropose,
  onPropose,
  onSelect,
  onIgnore,
  onRestore,
}: Props): ReactElement => {
  const t = useTranslations("EventList");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className={sectionLabelClass}>{t("title")}</h2>
        <p className={labelClass}>{t("subtitle")}</p>
        {canPropose ? undefined : (
          <p className={`${noteClass} mt-1`}>{t("needMandate")}</p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className={emptyStateClass}>{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <EventItem
              key={row.event.id}
              row={row}
              busy={busy}
              canPropose={canPropose}
              onPropose={onPropose}
              onSelect={onSelect}
              onIgnore={onIgnore}
            />
          ))}
        </ul>
      )}
      {ignoredCount === 0 ? undefined : (
        <div className="flex flex-wrap items-center gap-2">
          <span className={faintLabelClass}>
            {t("ignored", { count: ignoredCount })}
          </span>
          <button
            type="button"
            className={smallGhostButtonClass}
            disabled={busy}
            onClick={onRestore}
          >
            {t("restore")}
          </button>
        </div>
      )}
    </section>
  );
};
