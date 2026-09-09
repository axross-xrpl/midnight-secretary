import { z } from "zod";
import { filterMap } from "./array";
import type { FetchLike } from "./http";
import type { Result } from "./result";
import { err, fromPromise, ok } from "./result";
import type { SchemaError } from "./schema";
import { fromZod } from "./schema";

/**
 * 予定の開始または終了
 *
 * 終日の予定は日付だけを持ち、時刻ありの予定は ISO 8601 の日時を持つ
 */
export type EventTime =
  | { kind: "allDay"; date: string }
  | { kind: "timed"; dateTime: string };

/**
 * Google カレンダーから取り込んだ予定 1 件
 *
 * 一覧に出す項目 (件名、場所、開始、終了) だけに正規化している
 */
export type CalendarEventRecord = {
  id: string;
  summary: string;
  location?: string;
  start: EventTime;
  end: EventTime;
};

/**
 * Google カレンダーの読み取りが失敗した理由
 */
export type CalendarError =
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "http"; status: number }
  | { kind: "network"; cause: unknown }
  | SchemaError;

/**
 * 取得する期間
 */
export type EventRange = {
  timeMin: string;
  timeMax: string;
};

/**
 * Google カレンダーの読み取りに必要な I/O
 */
export type CalendarDeps = {
  fetch: FetchLike;
};

const EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const MAX_RESULTS = 50;

// Google の応答は項目が無いときに null で返ることがあるので nullish で受ける
const eventTimeSchema = z.object({
  date: z.string().nullish(),
  dateTime: z.string().nullish(),
});

const eventSchema = z.object({
  id: z.string(),
  summary: z.string().nullish(),
  location: z.string().nullish(),
  start: eventTimeSchema.nullish(),
  end: eventTimeSchema.nullish(),
});

const eventListSchema = z.object({
  items: z.array(eventSchema).nullish(),
});

type RawEventTime = z.infer<typeof eventTimeSchema>;

type RawEvent = z.infer<typeof eventSchema>;

const toEventTime = (
  raw: RawEventTime | null | undefined,
): EventTime | undefined => {
  if (typeof raw?.dateTime === "string") {
    return { kind: "timed", dateTime: raw.dateTime };
  }

  if (typeof raw?.date === "string") {
    return { kind: "allDay", date: raw.date };
  }

  return undefined;
};

const nonEmpty = (value: string | null | undefined): string | undefined => {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }

  return value;
};

// 開始か終了が読めない予定は一覧に出せないので捨てる
const toRecord = (raw: RawEvent): CalendarEventRecord | undefined => {
  const start = toEventTime(raw.start);
  const end = toEventTime(raw.end);

  if (start === undefined || end === undefined) {
    return undefined;
  }

  const location = nonEmpty(raw.location);

  return {
    id: raw.id,
    summary: raw.summary ?? "",
    start,
    end,
    ...(location === undefined ? {} : { location }),
  };
};

/**
 * events.list の応答 JSON を正規化済みの予定に変換する
 *
 * 外部入力の境界なので unknown で受けてスキーマでパースする
 */
export const parseEventsPayload = (
  payload: unknown,
): Result<CalendarEventRecord[], SchemaError> => {
  const parsed = fromZod(eventListSchema.safeParse(payload));

  if (!parsed.ok) {
    return parsed;
  }

  return ok(filterMap(parsed.value.items ?? [], toRecord));
};

const networkError = (cause: unknown): CalendarError => {
  return { kind: "network", cause };
};

const httpError = (status: number): CalendarError => {
  if (status === 401) {
    return { kind: "unauthenticated" };
  }

  if (status === 403) {
    return { kind: "forbidden" };
  }

  return { kind: "http", status };
};

/**
 * 主カレンダーの予定を期間指定で読み取る
 *
 * 繰り返しの予定は 1 件ずつに展開し、開始日時順で最大 50 件まで取る
 */
export const listUpcomingEvents = async (
  accessToken: string,
  range: EventRange,
  deps: CalendarDeps,
): Promise<Result<CalendarEventRecord[], CalendarError>> => {
  const params = new URLSearchParams({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(MAX_RESULTS),
  });
  const response = await fromPromise(
    deps.fetch(`${EVENTS_ENDPOINT}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    networkError,
  );

  if (!response.ok) {
    return response;
  }

  if (!response.value.ok) {
    return err(httpError(response.value.status));
  }

  const body = await fromPromise(response.value.json(), networkError);

  if (!body.ok) {
    return body;
  }

  return parseEventsPayload(body.value);
};
