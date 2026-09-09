import type { Result } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import type { CalendarEventId, IsoDate, IsoDateTime } from "./identifiers";

/**
 * 予定がいつ行われるか
 *
 * Google は終日の予定を日付で、時刻ありの予定を日時で返す
 */
export type EventTime =
  | { kind: "allDay"; startDate: IsoDate; endDate: IsoDate }
  | { kind: "timed"; start: IsoDateTime; end: IsoDateTime };

/**
 * ユーザの Google カレンダーから読み取った予定
 */
export type CalendarEvent = {
  id: CalendarEventId;
  title: string;
  when: EventTime;
  location?: string;
  description?: string;
};

/**
 * 秘書がカレンダーに書き戻したい予定 (まだ id を持たない)
 */
export type CalendarEventDraft = {
  title: string;
  when: EventTime;
  location?: string;
  description?: string;
};

/**
 * 半開区間 [from, to) の期間
 */
export type DateRange = {
  from: IsoDateTime;
  to: IsoDateTime;
};

/**
 * カレンダーの提供元とやり取りするときに起こりうる失敗
 */
export type CalendarError =
  | { kind: "unauthenticated" }
  | { kind: "tokenExpired" }
  | { kind: "forbidden" }
  | { kind: "http"; status: number }
  | { kind: "network"; cause: unknown }
  | SchemaError;

/**
 * 期間内にあるユーザの予定を一覧する
 */
export type ListEvents = (
  range: DateRange,
) => Promise<Result<readonly CalendarEvent[], CalendarError>>;

/**
 * id で予定を 1 件読み取る
 *
 * 予定が存在しないときは undefined に解決する
 */
export type GetEvent = (
  eventId: CalendarEventId,
) => Promise<Result<CalendarEvent | undefined, CalendarError>>;

/**
 * ユーザの主カレンダーに予定を 1 件書き込む
 */
export type InsertEvent = (
  draft: CalendarEventDraft,
) => Promise<Result<CalendarEvent, CalendarError>>;

/**
 * サインイン中のユーザ 1 人に代わって行うカレンダーへのアクセス
 *
 * 実装はそのユーザの認証情報からリクエストごとに作られるので、ユーザ id は渡さない
 */
export type CalendarPort = {
  listEvents: ListEvents;
  getEvent: GetEvent;
  insertEvent: InsertEvent;
};
