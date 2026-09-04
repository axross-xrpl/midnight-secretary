"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import { cardClass, primaryButtonClass } from "./styles";
import type { CalendarEventView } from "./types";

type Props = {
  events: readonly CalendarEventView[];
  busy: boolean;
  onPropose: (event: CalendarEventView) => void;
};

type ItemProps = {
  event: CalendarEventView;
  busy: boolean;
  onPropose: (event: CalendarEventView) => void;
};

const EventItem = ({ event, busy, onPropose }: ItemProps): ReactElement => {
  const t = useTranslations("EventList");
  const format = useFormatter();
  const start = new Date(event.start);
  const end = new Date(event.end);
  const when = event.allDay
    ? `${format.dateTimeRange(start, end, { dateStyle: "medium" })} (${t("allDay")})`
    : format.dateTimeRange(start, end, {
        dateStyle: "medium",
        timeStyle: "short",
      });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{event.title}</span>
          {match(event.classification)
            .with({ kind: "trip" }, ({ destination }) => (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {t("tripChip", { destination })}
              </span>
            ))
            .with({ kind: "other" }, () => undefined)
            .exhaustive()}
        </div>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{when}</span>
        {event.location === undefined ? undefined : (
          <span className="text-sm text-zinc-500 dark:text-zinc-500">
            {event.location}
          </span>
        )}
      </div>
      {match(event.classification)
        .with({ kind: "trip" }, () => (
          <button
            type="button"
            className={primaryButtonClass}
            disabled={busy}
            onClick={() => onPropose(event)}
          >
            {t("propose")}
          </button>
        ))
        .with({ kind: "other" }, () => undefined)
        .exhaustive()}
    </li>
  );
};

/**
 * Upcoming calendar events with a "propose a plan" action on the ones that
 * look like trips.
 */
export const EventList = ({ events, busy, onPropose }: Props): ReactElement => {
  const t = useTranslations("EventList");

  return (
    <section className={`${cardClass} flex flex-col gap-2`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("subtitle")}
        </p>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-black/8 dark:divide-white/[.145]">
          {events.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              busy={busy}
              onPropose={onPropose}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
