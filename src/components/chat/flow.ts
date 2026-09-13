import { match, P } from "ts-pattern";
import type { TripStatus } from "@/domain/trip";
import type { MandateResponse, TripResponse } from "@/lib/secretary-response";
import type { Activity, RequestFailure, Step } from "./types";

/**
 * クライアントだけが持つ状態
 *
 * `fresh` は直近の応答で得た trip で、props の trip より新しい間だけ優先する
 * `createdMandate` は最初の提案で自動で作った支払い枠で、refresh 後は props が勝つ
 */
export type FlowState = {
  activity: Activity;
  fresh?: TripResponse;
  createdMandate?: MandateResponse;
};

/**
 * 状態を進める操作
 */
export type FlowAction =
  | { type: "start"; step: Step }
  | { type: "succeed"; trip: TripResponse }
  | { type: "fail"; failure: RequestFailure }
  | { type: "dismiss" }
  | { type: "mandateCreated"; mandate: MandateResponse };

/**
 * 出張が進む順
 */
export const STATUS_ORDER = [
  "proposed",
  "approved",
  "paid",
  "written",
] as const satisfies readonly TripStatus[];

/**
 * 段の順 (提案 0、承認 1、支払い 2、カレンダー登録 3)
 */
export const STEP_ORDER = [
  "propose",
  "approve",
  "pay",
  "writeBack",
] as const satisfies readonly Step[];

const IDLE = { kind: "idle" } as const satisfies Activity;

/**
 * 何もしていない最初の状態
 */
export const INITIAL_FLOW_STATE = {
  activity: IDLE,
} as const satisfies FlowState;

const isBusy = (state: FlowState): boolean => {
  return state.activity.kind === "busy";
};

const onStart = (state: FlowState, step: Step): FlowState => {
  if (isBusy(state)) {
    return state;
  }

  return { ...state, activity: { kind: "busy", step } };
};

const onSucceed = (state: FlowState, trip: TripResponse): FlowState => {
  if (!isBusy(state)) {
    return state;
  }

  return { ...state, activity: IDLE, fresh: trip };
};

const onFail = (state: FlowState, failure: RequestFailure): FlowState => {
  if (state.activity.kind !== "busy") {
    return state;
  }

  return {
    ...state,
    activity: { kind: "failed", step: state.activity.step, failure },
  };
};

const onDismiss = (state: FlowState): FlowState => {
  if (state.activity.kind !== "failed") {
    return state;
  }

  return { ...state, activity: IDLE };
};

// 支払い枠は提案の 1 手の途中 (busy) で作られるので、activity は見ない
const onMandateCreated = (
  state: FlowState,
  mandate: MandateResponse,
): FlowState => {
  return { ...state, createdMandate: mandate };
};

/**
 * 状態遷移の純粋関数
 *
 * いまの状態に合わない操作は状態を変えない
 */
export const reduceFlow = (state: FlowState, action: FlowAction): FlowState => {
  return match(action)
    .with({ type: "start" }, ({ step }) => onStart(state, step))
    .with({ type: "succeed" }, ({ trip }) => onSucceed(state, trip))
    .with({ type: "fail" }, ({ failure }) => onFail(state, failure))
    .with({ type: "dismiss" }, () => onDismiss(state))
    .with({ type: "mandateCreated" }, ({ mandate }) =>
      onMandateCreated(state, mandate),
    )
    .exhaustive();
};

/**
 * 表示に使う trip: 直近の応答 (`fresh`) があればそれ、無ければサーバが読んだもの
 */
export const effectiveTrip = (
  fromServer: TripResponse | undefined,
  fresh: TripResponse | undefined,
): TripResponse | undefined => {
  return fresh ?? fromServer;
};

// 休止状態では status の次の段が現在で、trip が無ければ提案が現在
const idleStepIndex = (trip: TripResponse | undefined): number => {
  if (trip === undefined) {
    return 0;
  }

  return STATUS_ORDER.indexOf(trip.status) + 1;
};

/**
 * ステップ表示で強調する段の添字 (提案 0、承認 1、支払い 2、カレンダー登録 3)
 *
 * 進行中と失敗はその 1 手の段、休止状態は trip の status の次の段 (written は 4 で全段済み)
 */
export const stepIndexOf = (
  activity: Activity,
  trip: TripResponse | undefined,
): number => {
  return match(activity)
    .with({ kind: "idle" }, () => idleStepIndex(trip))
    .with({ kind: P.union("busy", "failed") }, ({ step }) =>
      STEP_ORDER.indexOf(step),
    )
    .exhaustive();
};
