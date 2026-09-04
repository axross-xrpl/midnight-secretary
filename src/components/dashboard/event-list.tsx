"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import {
  accentPillClass,
  emptyStateClass,
  eventIcon,
  labelClass,
  neutralPillClass,
  rowCardClass,
  sectionLabelClass,
  smallPrimaryButtonClass,
} from "./styles";
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
  const detail =
    event.location === undefined ? when : `${when} · ${event.location}`;

  return (
    <li className={rowCardClass}>
      <span className="text-xl" aria-hidden="true">
        {eventIcon[event.classification.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{event.title}</div>
        <div className={labelClass}>{detail}</div>
      </div>
      {match(event.classification)
        .with({ kind: "trip" }, ({ destination }) => (
          <span className={accentPillClass}>
            {t("tripChip", { destination })}
          </span>
        ))
        .with({ kind: "other" }, () => (
          <span className={neutralPillClass}>{t("otherChip")}</span>
        ))
        .exhaustive()}
      {match(event.classification)
        .with({ kind: "trip" }, () => (
          <button
            type="button"
            className={smallPrimaryButtonClass}
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
 * Upcoming calendar events, one row card each, with a "propose a plan"
 * action on the ones that look like trips.
 */
export const EventList = ({ events, busy, onPropose }: Props): ReactElement => {
  const t = useTranslations("EventList");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className={sectionLabelClass}>{t("title")}</h2>
        <p className={labelClass}>{t("subtitle")}</p>
      </div>
      {events.length === 0 ? (
        <p className={emptyStateClass}>{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
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
