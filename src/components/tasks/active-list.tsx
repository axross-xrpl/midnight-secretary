import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import {
  accentPillClass,
  emptyStateClass,
  labelClass,
  okPillClass,
  publicPillClass,
  rowCardClass,
  smallPrimaryButtonClass,
} from "@/components/chat/styles";
import type { TripStatus } from "@/domain/trip";
import { Link } from "@/i18n/navigation";
import type { TripResponse } from "@/lib/secretary-response";
import { EventWhen } from "./event-when";
import { chatHref } from "./query";

// 支払い済みは公開台帳に載った印
// written はこの一覧には来ない前提だが、網羅性のため登録済みの色を割り当てる
const statusPillClassOf = (status: TripStatus): string => {
  return match(status)
    .with("proposed", () => accentPillClass)
    .with("approved", () => accentPillClass)
    .with("paid", () => publicPillClass)
    .with("written", () => okPillClass)
    .exhaustive();
};

type ItemProps = {
  trip: TripResponse;
};

const ActiveTripItem = async ({ trip }: ItemProps): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");

  return (
    <li className={rowCardClass}>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">
          {trip.event.title === "" ? t("noTitle") : trip.event.title}
        </div>
        <div className={labelClass}>
          <EventWhen when={trip.event.when} />
        </div>
      </div>
      <span className={statusPillClassOf(trip.status)}>
        {t(`status.${trip.status}`)}
      </span>
      <Link href={chatHref(trip.event.id)} className={smallPrimaryButtonClass}>
        {t("open")}
      </Link>
    </li>
  );
};

type Props = {
  trips: readonly TripResponse[];
};

/**
 * 手配中の出張の一覧 (題名、日時、状態のバッジ、「会話を見る」)
 *
 * 行は `activeTripsOf` が絞ったものをその順序で出す
 * 0 件なら空の箱
 */
export const ActiveTripList = async ({
  trips,
}: Props): Promise<ReactElement> => {
  const t = await getTranslations("TasksPage");

  if (trips.length === 0) {
    return <p className={emptyStateClass}>{t("noActive")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {trips.map((trip) => (
        <ActiveTripItem key={trip.id} trip={trip} />
      ))}
    </ul>
  );
};
