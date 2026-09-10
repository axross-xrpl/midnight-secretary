import type { TripStatus } from "@/domain/trip";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type { SecretaryFailure, TripResponse } from "@/lib/secretary-response";

/**
 * 公開台帳の見え方
 *
 * domain の `PublicLedgerView` と同じ形で brand を外したもの
 * Server Component の props でしか渡らないので zod スキーマは持たない
 */
export type PublicLedgerView = {
  commitments: readonly { mandateId: string; commitment: string }[];
  authorizations: readonly { publicHash: string }[];
  authorizedCount: number;
};

/**
 * 画面が扱う失敗
 *
 * サーバの封筒 (`SecretaryFailure`) に、ブラウザ側で起こる 2 つを足したもの
 */
export type RequestFailure =
  | SecretaryFailure
  | { code: "network" }
  | { code: "schema" };

/**
 * 出張を 1 段進める操作
 *
 * `propose` は提案し直し (破棄) にも使う
 */
export type Step = "propose" | "approve" | "pay" | "writeBack";

/**
 * いま進行中の 1 手
 *
 * 予定ごとの休止状態は持たない (props の trips から導出する)
 */
export type Activity =
  | { kind: "idle" }
  | { kind: "busy"; step: Step; eventId: string }
  | { kind: "failed"; step: Step; eventId: string; failure: RequestFailure };

/**
 * クライアントだけが持つ状態
 *
 * `fresh` は直近の応答で得た trip を id で引くもので、props の trips より新しい間だけ優先する
 * `ignored` は画面内で隠した予定の id で、保存しない
 */
export type FlowState = {
  activity: Activity;
  fresh: Readonly<Record<string, TripResponse>>;
  ignored: readonly string[];
  selectedEventId?: string;
};

/**
 * 状態を進める操作
 */
export type FlowAction =
  | { type: "select"; eventId: string }
  | { type: "deselect" }
  | { type: "ignore"; eventId: string }
  | { type: "restoreIgnored" }
  | { type: "start"; step: Step; eventId: string }
  | { type: "succeed"; trip: TripResponse }
  | { type: "fail"; failure: RequestFailure }
  | { type: "dismiss" };

/**
 * 予定 1 件の休止状態
 */
export type EventRowState =
  | { kind: "unarranged" }
  | { kind: "arranged"; status: TripStatus };

/**
 * 一覧の 1 行
 */
export type EventRow = {
  event: ScanEvent;
  state: EventRowState;
};

/**
 * ステッパーが描くもの
 *
 * `trip` が無い `busy` / `failed` は、まだ trip の無い予定への提案
 */
export type StepperState =
  | { kind: "idle" }
  | { kind: "unarranged"; event: ScanEvent }
  | { kind: "arranged"; event: ScanEvent; trip: TripResponse }
  | { kind: "busy"; step: Step; event: ScanEvent; trip?: TripResponse }
  | {
      kind: "failed";
      step: Step;
      event: ScanEvent;
      trip?: TripResponse;
      failure: RequestFailure;
    };
