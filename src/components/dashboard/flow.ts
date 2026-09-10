import { match, P } from "ts-pattern";
import type { TripStatus } from "@/domain/trip";
import { filterMap } from "@/lib/array";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type { TripResponse } from "@/lib/secretary-response";
import type {
  Activity,
  EventRow,
  EventRowState,
  FlowAction,
  FlowState,
  RequestFailure,
  Step,
  StepperState,
} from "./types";

/**
 * 出張が進む順
 */
export const STATUS_ORDER = [
  "proposed",
  "approved",
  "paid",
  "written",
] as const satisfies readonly TripStatus[];

// ステッパーの段と 1 手の対応 (propose 0、approve 1、pay 2、writeBack 3)
const STEP_ORDER = [
  "propose",
  "approve",
  "pay",
  "writeBack",
] as const satisfies readonly Step[];

// 休止状態の trip に対して次に押せる 1 手 (written で終わり)
const NEXT_STEP = {
  proposed: "approve",
  approved: "pay",
  paid: "writeBack",
  written: undefined,
} as const satisfies Record<TripStatus, Step | undefined>;

const IDLE = { kind: "idle" } as const satisfies Activity;

/**
 * 何も選んでいない最初の状態
 */
export const INITIAL_FLOW_STATE = {
  activity: IDLE,
  fresh: {},
  ignored: [],
} as const satisfies FlowState;

/**
 * 1 手が進行中なら true
 */
export const isBusy = (state: FlowState): boolean => {
  return state.activity.kind === "busy";
};

// 選択を外した状態 (省略可能なフィールドを消すために組み直す)
const withoutSelection = (state: FlowState): FlowState => {
  return {
    activity: state.activity,
    fresh: state.fresh,
    ignored: state.ignored,
  };
};

const onSelect = (state: FlowState, eventId: string): FlowState => {
  if (isBusy(state)) {
    return state;
  }

  return { ...state, activity: IDLE, selectedEventId: eventId };
};

const onDeselect = (state: FlowState): FlowState => {
  if (isBusy(state)) {
    return state;
  }

  return withoutSelection({ ...state, activity: IDLE });
};

const onIgnore = (state: FlowState, eventId: string): FlowState => {
  if (isBusy(state)) {
    return state;
  }

  const ignored = state.ignored.includes(eventId)
    ? state.ignored
    : [...state.ignored, eventId];

  if (state.selectedEventId === eventId) {
    return withoutSelection({ ...state, activity: IDLE, ignored });
  }

  return { ...state, ignored };
};

const onRestoreIgnored = (state: FlowState): FlowState => {
  return { ...state, ignored: [] };
};

const onStart = (state: FlowState, step: Step, eventId: string): FlowState => {
  if (isBusy(state)) {
    return state;
  }

  return {
    ...state,
    activity: { kind: "busy", step, eventId },
    selectedEventId: eventId,
  };
};

const onSucceed = (state: FlowState, trip: TripResponse): FlowState => {
  if (!isBusy(state)) {
    return state;
  }

  return {
    ...state,
    activity: IDLE,
    fresh: { ...state.fresh, [trip.id]: trip },
    selectedEventId: trip.event.id,
  };
};

const onFail = (state: FlowState, failure: RequestFailure): FlowState => {
  if (state.activity.kind !== "busy") {
    return state;
  }

  return {
    ...state,
    activity: {
      kind: "failed",
      step: state.activity.step,
      eventId: state.activity.eventId,
      failure,
    },
  };
};

const onDismiss = (state: FlowState): FlowState => {
  if (state.activity.kind !== "failed") {
    return state;
  }

  return { ...state, activity: IDLE };
};

/**
 * 状態遷移の純粋関数
 *
 * いまの状態に合わない操作は状態を変えない
 */
export const reduceFlow = (state: FlowState, action: FlowAction): FlowState => {
  return match(action)
    .with({ type: "select" }, ({ eventId }) => onSelect(state, eventId))
    .with({ type: "deselect" }, () => onDeselect(state))
    .with({ type: "ignore" }, ({ eventId }) => onIgnore(state, eventId))
    .with({ type: "restoreIgnored" }, () => onRestoreIgnored(state))
    .with({ type: "start" }, ({ step, eventId }) =>
      onStart(state, step, eventId),
    )
    .with({ type: "succeed" }, ({ trip }) => onSucceed(state, trip))
    .with({ type: "fail" }, ({ failure }) => onFail(state, failure))
    .with({ type: "dismiss" }, () => onDismiss(state))
    .exhaustive();
};

const statusRank = (trip: TripResponse): number => {
  return STATUS_ORDER.indexOf(trip.status);
};

// 同じ status なら応答の方が新しい計画を持つので、応答を採る
const laterOf = (
  fromProps: TripResponse,
  fromFresh: TripResponse,
): TripResponse => {
  if (statusRank(fromProps) > statusRank(fromFresh)) {
    return fromProps;
  }

  return fromFresh;
};

const overlaid = (
  trip: TripResponse,
  fresh: Readonly<Record<string, TripResponse>>,
): TripResponse => {
  const candidate: TripResponse | undefined = fresh[trip.id];

  if (candidate === undefined) {
    return trip;
  }

  return laterOf(trip, candidate);
};

const isMissingFrom = (
  trips: readonly TripResponse[],
  trip: TripResponse,
): boolean => {
  return !trips.some((known) => known.id === trip.id);
};

/**
 * props の trips に直近の応答を重ねる
 *
 * 同じ id なら status の進んだ方、同じ status なら応答の方を採る
 * props に無い id の応答は末尾に足す (refresh が追いつく前の 1 回目の提案)
 */
export const effectiveTrips = (
  trips: readonly TripResponse[],
  fresh: Readonly<Record<string, TripResponse>>,
): readonly TripResponse[] => {
  const overlaidTrips = trips.map((trip) => overlaid(trip, fresh));
  const added = Object.values(fresh).filter((trip) =>
    isMissingFrom(trips, trip),
  );

  return [...overlaidTrips, ...added];
};

/**
 * 予定に結び付いた trip を引く
 *
 * 同じ予定の trip は多くても 1 件 (`TripId` の JSDoc)
 */
export const tripForEvent = (
  eventId: string,
  trips: readonly TripResponse[],
): TripResponse | undefined => {
  return trips.find((trip) => trip.event.id === eventId);
};

const writtenEventIdOf = (trip: TripResponse): string | undefined => {
  if (trip.status !== "written") {
    return undefined;
  }

  return trip.writtenEventId;
};

/**
 * 一覧に出す予定
 *
 * 無視した予定と、秘書が書き戻した予定 (written の `writtenEventId`) を除く
 */
export const visibleEvents = (
  events: readonly ScanEvent[],
  trips: readonly TripResponse[],
  ignored: readonly string[],
): readonly ScanEvent[] => {
  const hidden = [...ignored, ...filterMap(trips, writtenEventIdOf)];

  return events.filter((event) => !hidden.includes(event.id));
};

const rowStateOf = (
  event: ScanEvent,
  trips: readonly TripResponse[],
): EventRowState => {
  const trip = tripForEvent(event.id, trips);

  if (trip === undefined) {
    return { kind: "unarranged" };
  }

  return { kind: "arranged", status: trip.status };
};

/**
 * 予定ごとの休止状態を付けた一覧の行
 */
export const eventRowsOf = (
  events: readonly ScanEvent[],
  trips: readonly TripResponse[],
): readonly EventRow[] => {
  return events.map((event) => ({ event, state: rowStateOf(event, trips) }));
};

/**
 * ステッパーが描くものを、状態と props から導く
 */
export const stepperStateOf = (
  state: FlowState,
  events: readonly ScanEvent[],
  trips: readonly TripResponse[],
): StepperState => {
  const event = events.find(
    (candidate) => candidate.id === state.selectedEventId,
  );

  if (event === undefined) {
    return { kind: "idle" };
  }

  const trip = tripForEvent(event.id, trips);
  const activity = state.activity;

  if (activity.kind === "busy" && activity.eventId === event.id) {
    return {
      kind: "busy",
      step: activity.step,
      event,
      ...(trip === undefined ? {} : { trip }),
    };
  }

  if (activity.kind === "failed" && activity.eventId === event.id) {
    return {
      kind: "failed",
      step: activity.step,
      event,
      failure: activity.failure,
      ...(trip === undefined ? {} : { trip }),
    };
  }

  if (trip === undefined) {
    return { kind: "unarranged", event };
  }

  return { kind: "arranged", event, trip };
};

/**
 * ステッパーで強調する段の添字
 *
 * `idle` / `unarranged` は -1
 * `arranged` は status の添字、`busy` / `failed` は step の添字 (propose 0、approve 1、pay 2、writeBack 3)
 */
export const stepIndexOf = (state: StepperState): number => {
  return match(state)
    .with({ kind: P.union("idle", "unarranged") }, () => -1)
    .with({ kind: "arranged" }, ({ trip }) => statusRank(trip))
    .with({ kind: P.union("busy", "failed") }, ({ step }) =>
      STEP_ORDER.indexOf(step),
    )
    .exhaustive();
};

/**
 * 休止状態の trip に対して次に押せる 1 手
 *
 * `written` は undefined
 */
export const nextStepOf = (status: TripStatus): Step | undefined => {
  return NEXT_STEP[status];
};
