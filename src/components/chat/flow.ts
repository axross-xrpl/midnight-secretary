import { match, P } from "ts-pattern";
import type { PaymentVisibilityInput, TripStatus } from "@/domain/trip";
import type {
  MandateResponse,
  SettlementVisibilityResponse,
  TripResponse,
} from "@/lib/secretary-response";
import type { Activity, RequestFailure, Step } from "./types";

/**
 * 公開範囲を選べる候補
 *
 * `PaymentVisibilityInput` のキーと同じ集合
 */
export type VisibilityCategory =
  | "outbound"
  | "inbound"
  | "lodging"
  | "dining"
  | "leisure";

/**
 * クライアントだけが持つ状態
 *
 * `fresh` は直近の応答で得た trip で、props の trip より新しい間だけ優先する
 * `createdMandate` は最初の提案で自動で作った支払い枠で、refresh 後は props が勝つ
 * `visibility` は提案済みの計画に対していま選んでいる公開範囲で、空はすべて公開
 */
export type FlowState = {
  activity: Activity;
  fresh?: TripResponse;
  createdMandate?: MandateResponse;
  visibility: PaymentVisibilityInput;
};

/**
 * 状態を進める操作
 */
export type FlowAction =
  | { type: "start"; step: Step }
  | { type: "askConsent" }
  | { type: "declineConsent" }
  | { type: "succeed"; trip: TripResponse }
  | { type: "fail"; failure: RequestFailure }
  | { type: "dismiss" }
  | { type: "mandateCreated"; mandate: MandateResponse }
  | {
      type: "setVisibility";
      category: VisibilityCategory;
      value: SettlementVisibilityResponse;
    };

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
 * ステップ表示の段
 *
 * 1 手 (`Step`) のうち組み直しは承認の段の中の 1 手なので、段には無い
 */
export type Stage = "propose" | "approve" | "pay" | "writeBack";

/**
 * 段の順 (提案 0、承認 1、支払い 2、カレンダー登録 3)
 */
export const STEP_ORDER = [
  "propose",
  "approve",
  "pay",
  "writeBack",
] as const satisfies readonly Stage[];

const IDLE = { kind: "idle" } as const satisfies Activity;

const AWAITING_CONSENT = {
  kind: "awaitingConsent",
} as const satisfies Activity;

/**
 * 何もしていない最初の状態
 */
export const INITIAL_FLOW_STATE = {
  activity: IDLE,
  visibility: {},
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

// 同意の問いはユーザが承認を押した後の返事待ちなので、休止中からだけ入る
const onAskConsent = (state: FlowState): FlowState => {
  if (state.activity.kind !== "idle") {
    return state;
  }

  return { ...state, activity: AWAITING_CONSENT };
};

// 「今はやめておく」は提案に戻るだけで、選んだ公開範囲はそのまま残す
const onDeclineConsent = (state: FlowState): FlowState => {
  if (state.activity.kind !== "awaitingConsent") {
    return state;
  }

  return { ...state, activity: IDLE };
};

// 1 手が済めばその計画に対する選択は用済みなので、次の提案に持ち越さない
const onSucceed = (state: FlowState, trip: TripResponse): FlowState => {
  if (!isBusy(state)) {
    return state;
  }

  return { ...state, activity: IDLE, fresh: trip, visibility: {} };
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

const onSetVisibility = (
  state: FlowState,
  category: VisibilityCategory,
  value: SettlementVisibilityResponse,
): FlowState => {
  return { ...state, visibility: { ...state.visibility, [category]: value } };
};

/**
 * 状態遷移の純粋関数
 *
 * いまの状態に合わない操作は状態を変えない
 */
export const reduceFlow = (state: FlowState, action: FlowAction): FlowState => {
  return match(action)
    .with({ type: "start" }, ({ step }) => onStart(state, step))
    .with({ type: "askConsent" }, () => onAskConsent(state))
    .with({ type: "declineConsent" }, () => onDeclineConsent(state))
    .with({ type: "succeed" }, ({ trip }) => onSucceed(state, trip))
    .with({ type: "fail" }, ({ failure }) => onFail(state, failure))
    .with({ type: "dismiss" }, () => onDismiss(state))
    .with({ type: "mandateCreated" }, ({ mandate }) =>
      onMandateCreated(state, mandate),
    )
    .with({ type: "setVisibility" }, ({ category, value }) =>
      onSetVisibility(state, category, value),
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

// 組み直しは承認の段の中の 1 手なので、段としては承認に数える
const stageOf = (step: Step): Stage => {
  if (step === "replan") {
    return "approve";
  }

  return step;
};

/**
 * ステップ表示で強調する段の添字 (提案 0、承認 1、支払い 2、カレンダー登録 3)
 *
 * 進行中と失敗はその 1 手の段、休止状態は trip の status の次の段 (written は 4 で全段済み)
 * 証明を送るかの返事待ちと組み直しは承認の段 (承認の 1 手の途中なので)
 */
export const stepIndexOf = (
  activity: Activity,
  trip: TripResponse | undefined,
): number => {
  return match(activity)
    .with({ kind: "idle" }, () => idleStepIndex(trip))
    .with({ kind: "awaitingConsent" }, () => STEP_ORDER.indexOf("approve"))
    .with({ kind: P.union("busy", "failed") }, ({ step }) =>
      STEP_ORDER.indexOf(stageOf(step)),
    )
    .exhaustive();
};
