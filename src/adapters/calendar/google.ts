import { z } from "zod";
import type {
  CalendarError,
  CalendarEvent,
  CalendarEventDraft,
  CalendarPort,
  DateRange,
  EventTime,
} from "@/domain/calendar";
import type { ParseError } from "@/domain/identifiers";
import {
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import { isDefined } from "@/lib/array";
import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { all, err, fromPromise, ok } from "@/lib/result";
import type { SchemaError } from "@/lib/schema";
import { fromZod } from "@/lib/schema";

/**
 * Google カレンダーの読み書きに必要な I/O
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
  description: z.string().nullish(),
  start: eventTimeSchema.nullish(),
  end: eventTimeSchema.nullish(),
});

const eventListSchema = z.object({
  items: z.array(eventSchema).nullish(),
});

type RawEventTime = z.infer<typeof eventTimeSchema>;

type RawEvent = z.infer<typeof eventSchema>;

const schemaError = (
  path: readonly PropertyKey[],
  message: string,
): SchemaError => {
  return { kind: "schema", issues: [{ path, message }] };
};

// 日付や id が domain の型に収まらない応答は、形が違う応答と同じ扱いにする
const fromParseError = (error: ParseError): SchemaError => {
  return schemaError([error.field], `${error.field} の形が想定と違います`);
};

const nonEmpty = (value: string | null | undefined): string | undefined => {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }

  return value;
};

const timedTime = (
  rawStart: string,
  rawEnd: string,
): Result<EventTime, SchemaError> => {
  const start = parseIsoDateTime(rawStart);

  if (!start.ok) {
    return err(fromParseError(start.error));
  }

  const end = parseIsoDateTime(rawEnd);

  if (!end.ok) {
    return err(fromParseError(end.error));
  }

  return ok({ kind: "timed", start: start.value, end: end.value });
};

const allDayTime = (
  rawStart: string,
  rawEnd: string,
): Result<EventTime, SchemaError> => {
  const startDate = parseIsoDate(rawStart);

  if (!startDate.ok) {
    return err(fromParseError(startDate.error));
  }

  const endDate = parseIsoDate(rawEnd);

  if (!endDate.ok) {
    return err(fromParseError(endDate.error));
  }

  return ok({
    kind: "allDay",
    startDate: startDate.value,
    endDate: endDate.value,
  });
};

// 開始と終了が揃っていない予定は一覧に出せないので undefined にして捨てる
const toEventTime = (
  start: RawEventTime | null | undefined,
  end: RawEventTime | null | undefined,
): Result<EventTime | undefined, SchemaError> => {
  if (
    typeof start?.dateTime === "string" &&
    typeof end?.dateTime === "string"
  ) {
    return timedTime(start.dateTime, end.dateTime);
  }

  if (typeof start?.date === "string" && typeof end?.date === "string") {
    return allDayTime(start.date, end.date);
  }

  return ok(undefined);
};

const toEvent = (
  raw: RawEvent,
): Result<CalendarEvent | undefined, SchemaError> => {
  const when = toEventTime(raw.start, raw.end);

  if (!when.ok) {
    return when;
  }

  if (when.value === undefined) {
    return ok(undefined);
  }

  const id = parseCalendarEventId(raw.id);

  if (!id.ok) {
    return err(fromParseError(id.error));
  }

  const location = nonEmpty(raw.location);
  const description = nonEmpty(raw.description);

  return ok({
    id: id.value,
    title: raw.summary ?? "",
    when: when.value,
    ...(location === undefined ? {} : { location }),
    ...(description === undefined ? {} : { description }),
  });
};

/**
 * events.list の応答 JSON を domain の予定に変換する
 *
 * 外部入力の境界なので unknown で受けてスキーマでパースする
 */
export const parseEventsPayload = (
  payload: unknown,
): Result<CalendarEvent[], SchemaError> => {
  const parsed = fromZod(eventListSchema.safeParse(payload));

  if (!parsed.ok) {
    return parsed;
  }

  const events = all((parsed.value.items ?? []).map(toEvent));

  if (!events.ok) {
    return events;
  }

  return ok(events.value.filter(isDefined));
};

const parseOneEvent = (
  payload: unknown,
): Result<CalendarEvent, SchemaError> => {
  const parsed = fromZod(eventSchema.safeParse(payload));

  if (!parsed.ok) {
    return parsed;
  }

  const event = toEvent(parsed.value);

  if (!event.ok) {
    return event;
  }

  if (event.value === undefined) {
    return err(schemaError(["start"], "開始か終了が読み取れません"));
  }

  return ok(event.value);
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

const authHeaders = (accessToken: string): HeadersInit => {
  return { Authorization: `Bearer ${accessToken}` };
};

const timesFor = (when: EventTime) => {
  if (when.kind === "allDay") {
    return {
      start: { date: when.startDate },
      end: { date: when.endDate },
    };
  }

  return { start: { dateTime: when.start }, end: { dateTime: when.end } };
};

const insertBody = (draft: CalendarEventDraft) => {
  return {
    summary: draft.title,
    ...(draft.location === undefined ? {} : { location: draft.location }),
    ...(draft.description === undefined
      ? {}
      : { description: draft.description }),
    ...timesFor(draft.when),
  };
};

/**
 * 主カレンダーの予定を期間指定で読み取る
 *
 * 繰り返しの予定は 1 件ずつに展開し、開始日時順で最大 50 件まで取る
 */
const listEvents = async (
  accessToken: string,
  range: DateRange,
  deps: CalendarDeps,
): Promise<Result<readonly CalendarEvent[], CalendarError>> => {
  const params = new URLSearchParams({
    timeMin: range.from,
    timeMax: range.to,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(MAX_RESULTS),
  });
  const response = await fromPromise(
    deps.fetch(`${EVENTS_ENDPOINT}?${params}`, {
      headers: authHeaders(accessToken),
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

/**
 * 主カレンダーの予定を 1 件読み取る
 *
 * 消された予定や他人の予定は 404 になるので、失敗ではなく undefined として返す
 */
const getEvent = async (
  accessToken: string,
  eventId: string,
  deps: CalendarDeps,
): Promise<Result<CalendarEvent | undefined, CalendarError>> => {
  const response = await fromPromise(
    deps.fetch(`${EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`, {
      headers: authHeaders(accessToken),
    }),
    networkError,
  );

  if (!response.ok) {
    return response;
  }

  if (response.value.status === 404) {
    return ok(undefined);
  }

  if (!response.value.ok) {
    return err(httpError(response.value.status));
  }

  const body = await fromPromise(response.value.json(), networkError);

  if (!body.ok) {
    return body;
  }

  return parseOneEvent(body.value);
};

/**
 * 主カレンダーに予定を 1 件書き込む
 */
const insertEvent = async (
  accessToken: string,
  draft: CalendarEventDraft,
  deps: CalendarDeps,
): Promise<Result<CalendarEvent, CalendarError>> => {
  const response = await fromPromise(
    deps.fetch(EVENTS_ENDPOINT, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(insertBody(draft)),
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

  return parseOneEvent(body.value);
};

/**
 * サインイン中のユーザ 1 人分の Google カレンダー
 *
 * アクセストークンはリクエストごとに解決するので、port もリクエストごとに作る
 */
export const createGoogleCalendar = (
  accessToken: string,
  deps: CalendarDeps,
): CalendarPort => {
  return {
    listEvents: (range) => listEvents(accessToken, range, deps),
    getEvent: (eventId) => getEvent(accessToken, eventId, deps),
    insertEvent: (draft) => insertEvent(accessToken, draft, deps),
  };
};
