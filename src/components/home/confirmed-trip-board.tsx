"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  DATE_OPTIONS,
  moneyText,
  plainSpaces,
  TIMED_OPTIONS,
} from "@/components/chat/format";
import {
  accentPillClass,
  emptyStateClass,
  faintLabelClass,
  ghostButtonClass,
  labelClass,
  neutralPillClass,
  okPillClass,
  rowCardClass,
} from "@/components/chat/styles";
import { useFormatNumber } from "@/components/chat/use-format-number";
import { categoryIcons } from "@/components/settings/category-icons";
import type {
  ConfirmedTrip,
  ConfirmedTripItem,
  ConfirmedTripItemStatus,
} from "@/features/trips/confirmed-trip";
import { totalJpycOf } from "@/features/trips/confirmed-trip";

// 明細の状態ごとのバッジ (会話画面と同じ色の使い分け)
const itemPillClasses = {
  selected: neutralPillClass,
  paid: accentPillClass,
  booked: okPillClass,
  cancelled: neutralPillClass,
} as const satisfies Record<ConfirmedTripItemStatus, string>;

type MoneyProps = {
  amount: number;
};

// 金額は会話画面と同じ「整数 通貨コード」で出す
// DB は円単位の整数を持つが demo の通貨は MST なので、カタログの real 実装と揃える
const Money = ({ amount }: MoneyProps): ReactElement => {
  const formatNumber = useFormatNumber();

  return <>{moneyText({ amount, currency: "MST" }, formatNumber)}</>;
};

type PeriodProps = {
  trip: ConfirmedTrip;
};

// 出発日から帰着日まで (帰着日を持たない日帰りは出発日だけ)
const TripPeriod = ({ trip }: PeriodProps): ReactElement => {
  const format = useFormatter();
  const start = new Date(trip.startDate);
  const text =
    trip.endDate === null
      ? format.dateTime(start, DATE_OPTIONS)
      : format.dateTimeRange(start, new Date(trip.endDate), DATE_OPTIONS);

  return <>{plainSpaces(text)}</>;
};

type ItemWhenProps = {
  item: ConfirmedTripItem;
};

// 明細の日時 (終わりを持つものは範囲、始まりだけならその時点、時刻が無ければ出さない)
const ItemWhen = ({ item }: ItemWhenProps): ReactElement | null => {
  const format = useFormatter();

  if (item.startAt === null) {
    return null;
  }

  const start = new Date(item.startAt);
  const text =
    item.endAt === null
      ? format.dateTime(start, TIMED_OPTIONS)
      : format.dateTimeRange(start, new Date(item.endAt), TIMED_OPTIONS);

  return <span>{plainSpaces(text)}</span>;
};

type ItemProps = {
  item: ConfirmedTripItem;
};

const DetailItem = ({ item }: ItemProps): ReactElement => {
  const t = useTranslations("Home");
  const categories = useTranslations("ServiceManagement");
  const Icon = categoryIcons[item.category];

  return (
    <li className="flex flex-wrap items-center gap-3 p-3 px-3.5">
      <Icon aria-hidden className="size-4 flex-none text-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{item.name}</div>
        <div className={`mt-[3px] flex flex-wrap gap-x-2 ${labelClass}`}>
          <span>{categories(`categories.${item.category}`)}</span>
          <ItemWhen item={item} />
        </div>
        {item.bookingRef !== null && (
          <div className={`mt-[3px] ${faintLabelClass}`}>
            {t("trips.detail.bookingRef")}: {item.bookingRef}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-[13px] font-bold tabular-nums">
          <Money amount={item.priceJpyc} />
        </div>
        <div className={labelClass}>
          {t("trips.detail.unitPrice", {
            price: item.unitPriceJpyc,
            count: item.quantity,
          })}
        </div>
      </div>
      <span className={itemPillClasses[item.status]}>
        {t(`trips.detail.status.${item.status}`)}
      </span>
    </li>
  );
};

type DialogProps = {
  trip: ConfirmedTrip;
  onClose: () => void;
};

/**
 * 旅程 1 件の詳細のポップアップ
 *
 * 開いているかどうかは React の状態だけで決まる (`<dialog>` の `showModal()` は使わない)
 * 閉じ方は Escape と「閉じる」の 2 つ
 */
const TripDialog = ({ trip, onClose }: DialogProps): ReactElement => {
  const t = useTranslations("Home");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={trip.title}
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 px-6 text-ink"
      >
        <header className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold">{trip.title}</h2>
            <p className={`mt-[3px] ${labelClass}`}>
              {t("trips.route", {
                from: trip.originCity,
                to: trip.destinationCity,
                count: trip.items.length,
              })}{" "}
              · <TripPeriod trip={trip} />
            </p>
          </div>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            {t("trips.detail.close")}
          </button>
        </header>

        <section className="flex flex-col gap-2">
          <h3 className={labelClass}>{t("trips.detail.items")}</h3>
          {trip.items.length === 0 ? (
            <p className={emptyStateClass}>{t("trips.detail.noItems")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-sub overflow-hidden rounded-xl border border-border-sub">
              {trip.items.map((item) => (
                <DetailItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>

        <footer className="flex items-center justify-between border-t border-border pt-3">
          <span className={labelClass}>{t("trips.total")}</span>
          <span className="text-[19px] font-bold tabular-nums">
            <Money amount={totalJpycOf(trip.items)} />
          </span>
        </footer>
      </div>
    </div>
  );
};

type RowProps = {
  trip: ConfirmedTrip;
  onOpen: (tripId: string) => void;
};

const TripRow = ({ trip, onOpen }: RowProps): ReactElement => {
  const t = useTranslations("Home");

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(trip.id)}
        className={`${rowCardClass} w-full cursor-pointer text-left`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{trip.title}</span>
          <span className={`mt-[3px] block ${labelClass}`}>
            {t("trips.route", {
              from: trip.originCity,
              to: trip.destinationCity,
              count: trip.items.length,
            })}{" "}
            · <TripPeriod trip={trip} />
          </span>
        </span>
        <span className="text-right">
          <span className={`block ${labelClass}`}>{t("trips.total")}</span>
          <span className="block text-[17px] font-bold tabular-nums">
            <Money amount={totalJpycOf(trip.items)} />
          </span>
        </span>
      </button>
    </li>
  );
};

type BoardProps = {
  trips: readonly ConfirmedTrip[];
};

/**
 * 確定した旅程の一覧
 *
 * 行をクリックするとその旅程の明細をポップアップで出す
 * 一覧も明細も同じ 1 回の読み取りで届いているので、開くのに通信は要らない
 */
export const ConfirmedTripBoard = ({ trips }: BoardProps): ReactElement => {
  const t = useTranslations("Home");
  const [openedTripId, setOpenedTripId] = useState<string | undefined>(
    undefined,
  );
  const close = useCallback(() => setOpenedTripId(undefined), []);
  const opened = trips.find((trip) => trip.id === openedTripId);

  if (trips.length === 0) {
    return <p className={emptyStateClass}>{t("trips.empty")}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {trips.map((trip) => (
          <TripRow key={trip.id} trip={trip} onOpen={setOpenedTripId} />
        ))}
      </ul>
      {opened !== undefined && <TripDialog trip={opened} onClose={close} />}
    </>
  );
};
