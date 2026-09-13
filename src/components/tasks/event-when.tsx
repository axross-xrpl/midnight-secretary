import { getFormatter } from "next-intl/server";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import {
  DATE_OPTIONS,
  inclusiveEndDate,
  plainSpaces,
  TIMED_OPTIONS,
} from "@/components/chat/format";
import type { ScanEventTime } from "@/lib/calendar-scan-response";

type EventWhenProps = {
  when: ScanEventTime;
};

/**
 * 予定の日時 (終日は最終日まで、時刻付きは開始から終了)
 *
 * 会話画面のヘッダと同じ書式で、予定一覧の 3 つの一覧が共有する
 * Server Component なので書式はリクエストのロケールで決まる
 */
export const EventWhen = async ({
  when,
}: EventWhenProps): Promise<ReactElement> => {
  const format = await getFormatter();
  const text = plainSpaces(
    match(when)
      .with({ kind: "allDay" }, ({ startDate, endDate }) =>
        format.dateTimeRange(
          new Date(startDate),
          new Date(inclusiveEndDate(startDate, endDate)),
          DATE_OPTIONS,
        ),
      )
      .with({ kind: "timed" }, ({ start, end }) =>
        format.dateTimeRange(new Date(start), new Date(end), TIMED_OPTIONS),
      )
      .exhaustive(),
  );

  return <span>{text}</span>;
};
