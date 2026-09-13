import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import type { FormatNumber } from "@/components/chat/format";
import { moneyText, planRows } from "@/components/chat/format";
import {
  cardClass,
  emptyStateClass,
  labelClass,
  okPillClass,
  smallGhostButtonClass,
} from "@/components/chat/styles";
import { Link } from "@/i18n/navigation";
import type { TripResponse } from "@/lib/secretary-response";
import { EventWhen } from "./event-when";
import { chatHref } from "./query";

type ItemProps = {
  trip: TripResponse;
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
        <div className="text-[17px] font-bold">
          {trip.event.title === "" ? t("noTitle") : trip.event.title}
        </div>
        <div className="mt-[3px] text-[12.5px] text-muted">
          {t("route", {
            from: trip.plan.outbound.origin,
            to: trip.plan.outbound.destination,
            count: planRows(trip.plan).length,
          })}{" "}
          · <EventWhen when={trip.event.when} />
        </div>
      </div>
      <div className="text-right">
        <div className={labelClass}>{t("total")}</div>
        <div className="text-[19px] font-bold tabular-nums">
          {moneyText(trip.plan.total, formatNumber)}
        </div>
      </div>
      <span className={okPillClass}>{t("status.written")}</span>
      <Link
        href={chatHref(trip.event.id, "trips")}
        className={smallGhostButtonClass}
      >
        {t("open")}
      </Link>
    </li>
  );
};

type Props = {
  trips: readonly TripResponse[];
};

/**
 * 確定旅程の一覧 (題名、経路と件数、期間、合計、「登録済み」、「会話を見る」)
 *
 * 行は `confirmedTripsOf` が絞ったものをその順序で出す
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
