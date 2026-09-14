import type { EventTime } from "@/domain/calendar";
import { addDays } from "@/domain/dates";
import type { IsoDate } from "@/domain/identifiers";
import { jstDateOf } from "../jst";

/**
 * 予定から読み取った出発日と帰着日
 */
export type TripDates = {
  departOn: IsoDate;
  returnOn: IsoDate;
};

// 終日の予定は `endDate` の始まりで終わるので、旅行者はその前日に戻る
const lastDayOf = (startDate: IsoDate, endDate: IsoDate): IsoDate => {
  const lastDay = addDays(endDate, -1);

  if (lastDay < startDate) {
    return startDate;
  }

  return lastDay;
};

/**
 * 予定の日時から出張の出発日と帰着日を出す
 *
 * 終日の予定は終了日が翌日を指すので前日に戻し、時刻ありの予定は JST の日付を取る
 * planner の Fake と Gemini の adapter が共有し、日付の計算を LLM に任せない
 */
export const datesOf = (when: EventTime): TripDates => {
  if (when.kind === "allDay") {
    return {
      departOn: when.startDate,
      returnOn: lastDayOf(when.startDate, when.endDate),
    };
  }

  return { departOn: jstDateOf(when.start), returnOn: jstDateOf(when.end) };
};
