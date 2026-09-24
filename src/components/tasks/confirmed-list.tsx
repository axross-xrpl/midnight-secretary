import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import type { FormatNumber } from "@/components/chat/format";
import { DATE_OPTIONS, moneyText, plainSpaces } from "@/components/chat/format";
import {
  cardClass,
  emptyStateClass,
  labelClass,
  okPillClass,
  smallGhostButtonClass,
} from "@/components/chat/styles";
import type { ConfirmedTrip } from "@/domain/store";
import { Link } from "@/i18n/navigation";
import { DeleteConfirmedButton } from "./delete-confirmed-button";
import { chatHref } from "./query";

type ItemProps = {
  trip: ConfirmedTrip;
};

// 確定旅程は元の予定に戻れるときだけ「会話を見る」を出す (`source_event_id` が無い行は会話が無い)
const OpenLink = async ({
  trip,
}: ItemProps): Promise<ReactElement | undefined> => {
  const sourceEventId = trip.sourceEventId;

  if (sourceEventId === undefined) {
    return undefined;
  }

  const t = await getTranslations("TasksPage");

  return (
    <Link
      href={chatHref(sourceEventId, "trips")}
      className={smallGhostButtonClass}
    >
      {t("open")}
    </Link>
  );
};

// 旅程の期間 (日帰りは出発日と同じ日付が両端に来る)
const TripDates = async ({ trip }: ItemProps): Promise<ReactElement> => {
  const format = await getFormatter();
  const text = plainSpaces(
    format.dateTimeRange(
      new Date(trip.startDate),
      new Date(trip.endDate ?? trip.startDate),
      DATE_OPTIONS,
    ),
  );

  return <span>{text}</span>;
};

// 参考実装の trip header に寄せた行 (左に題名と経路、右に合計)
// この一覧は確定旅程タブにあるので、会話画面からは確定旅程タブに戻る
const ConfirmedTripItem = async ({
  trip,
}: ItemProps): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");
  const format = await getFormatter();
  // 桁区切りは Server Component なので `getFormatter().number` を包む (`useFormatNumber` はクライアント用)
  const formatNumber: FormatNumber = (amount) => {
    return format.number(amount);
  };

  return (
    <li className={`${cardClass} flex flex-wrap items-center gap-5`}>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold">
          {trip.title === "" ? t("noTitle") : trip.title}
        </div>
        <div className="mt-1 text-sm text-muted">
          {t("route", {
            from: trip.originCity,
            to: trip.destinationCity,
            count: trip.items.length,
          })}{" "}
          · <TripDates trip={trip} />
        </div>
      </div>
      <div className="text-right">
        <div className={labelClass}>{t("total")}</div>
        <div className="text-xl font-semibold tabular-nums">
          {moneyText(trip.total, formatNumber)}
        </div>
      </div>
      <span className={okPillClass}>{t("status.written")}</span>
      <OpenLink trip={trip} />
      <DeleteConfirmedButton tripId={trip.id} />
    </li>
  );
};

type Props = {
  trips: readonly ConfirmedTrip[];
};

/**
 * 確定旅程の一覧 (題名、経路と件数、期間、合計、「登録済み」、「会話を見る」、「削除」)
 *
 * 行は `confirmedTripsOf` が並べたものをその順序で出す
 * 0 件なら空の箱
 */
export const ConfirmedTripList = async ({
  trips,
}: Props): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");

  if (trips.length === 0) {
    return <p className={emptyStateClass}>{t("noConfirmed")}</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {trips.map((trip) => (
        <ConfirmedTripItem key={trip.id} trip={trip} />
      ))}
    </ul>
  );
};
