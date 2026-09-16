import type { ReactElement } from "react";
import { match } from "ts-pattern";

/**
 * 仮の予定 1 件
 *
 * trip は 2 日間の出張の 1 日目、tripContinued は 2 日目 (帯の続き、文字なし)
 */
export type LandingCalendarEvent =
  | { kind: "plain"; label: string }
  | { kind: "trip"; label: string }
  | { kind: "tripContinued" };

/**
 * カレンダーの 1 マス
 */
export type LandingCalendarCell = {
  /** 日 (前後の月のマスも日だけ持つ) */
  day: number;

  /** 前後の月のマス (薄く出す) */
  outsideMonth: boolean;

  event?: LandingCalendarEvent;
};

const dayOfWeekLabels = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;

// マスの番号をキーにした仮の予定
// 木曜 (index % 7 === 3) は出張の帯の始まりの列なので他の予定を置かない
// 土日 (index % 7 が 5 か 6) にも置かない
const landingCalendarEvents: Partial<Record<number, LandingCalendarEvent>> = {
  2: { kind: "plain", label: "Design review" },
  11: { kind: "plain", label: "Lunch w/ Mari" },
  15: { kind: "plain", label: "Dentist" },
  21: { kind: "plain", label: "Board prep" },
  24: { kind: "trip", label: "Osaka trip" },
  25: { kind: "tripContinued" },
  30: { kind: "plain", label: "Quarterly review" },
  31: { kind: "trip", label: "Osaka trip" },
  32: { kind: "tripContinued" },
};

// index 0 が 8/31、1..30 が 9/1..9/30、31..34 が 10/1..10/4
const dayOfIndex = (index: number): number => {
  if (index === 0) {
    return 31;
  }

  if (index >= 31) {
    return index - 30;
  }

  return index;
};

// 予定の無いマスは event のキーごと持たない
const cellOfIndex = (index: number): LandingCalendarCell => {
  const day = dayOfIndex(index);
  const outsideMonth = index === 0 || index >= 31;
  const event = landingCalendarEvents[index];

  if (event === undefined) {
    return { day, outsideMonth };
  }

  return { day, outsideMonth, event };
};

/**
 * 2026 年 9 月の 35 マス (index 0 が 8/31 の月曜、34 が 10/4 の日曜)
 */
export const buildLandingCalendarCells = (): LandingCalendarCell[] => {
  return Array.from({ length: 35 }, (_, index) => cellOfIndex(index));
};

// 前後の月の 1..4 が当月の 1..4 と重なるので、月の内外も混ぜて一意にする
const cellKeyOf = (cell: LandingCalendarCell): string => {
  if (cell.outsideMonth) {
    return `outside-${cell.day}`;
  }

  return `september-${cell.day}`;
};

type ChipProps = {
  event: LandingCalendarEvent;
};

// 出張は 1 日目のチップをマスの右端まで伸ばし、2 日目は左端から続ける
// 2 日目は文字を持たないので、1 日目と高さを揃えるために改行しない空白を置く
const EventChip = ({ event }: ChipProps): ReactElement => {
  return match(event)
    .with({ kind: "plain" }, ({ label }) => (
      <span className="landing-hero__chip landing-hero__chip--ghost">
        {label}
      </span>
    ))
    .with({ kind: "trip" }, ({ label }) => (
      <span className="landing-hero__chip landing-hero__chip--start">
        {label}
      </span>
    ))
    .with({ kind: "tripContinued" }, () => (
      <span className="landing-hero__chip landing-hero__chip--cont">
        &nbsp;
      </span>
    ))
    .exhaustive();
};

type CellProps = {
  cell: LandingCalendarCell;
};

const Cell = ({ cell }: CellProps): ReactElement => {
  const className = cell.outsideMonth
    ? "landing-hero__cell landing-hero__cell--outside"
    : "landing-hero__cell";

  return (
    <div className={className}>
      <span>{cell.day}</span>
      {cell.event === undefined ? undefined : <EventChip event={cell.event} />}
    </div>
  );
};

/**
 * ヒーローの背景に敷く 2026 年 9 月のカレンダー
 *
 * 飾りなので中身は読み上げない
 */
export const LandingCalendar = (): ReactElement => {
  return (
    <div className="landing-hero__calendar" aria-hidden>
      {dayOfWeekLabels.map((label) => (
        <div key={label} className="landing-hero__dow">
          {label}
        </div>
      ))}
      {buildLandingCalendarCells().map((cell) => (
        <Cell key={cellKeyOf(cell)} cell={cell} />
      ))}
    </div>
  );
};
