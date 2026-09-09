import type { CalendarEvent, DateRange } from "@/domain/calendar";
import type {
  CalendarEventId,
  IsoDateTime,
  TripId,
  UserId,
} from "@/domain/identifiers";
import type { Locale } from "@/domain/locale";
import type { Mandate, MandateDraft, PublicLedgerView } from "@/domain/mandate";
import type { TravelerPreferences } from "@/domain/plan";
import type {
  ApprovedTrip,
  EventText,
  PaidTrip,
  ProposedTrip,
  Trip,
  WrittenTrip,
} from "@/domain/trip";
import type { Result } from "@/lib/result";
import { err } from "@/lib/result";
import type { SecretaryDeps } from "./deps";
import type { SecretaryError } from "./errors";

/**
 * ダッシュボードが表示するものすべて (ユーザの mandate があればそれ、今後の予定、trip)
 */
export type Dashboard = {
  mandate?: Mandate;
  events: readonly CalendarEvent[];
  trips: readonly Trip[];
};

/**
 * demo で並べて見せる台帳の 2 つの面
 */
export type LedgerViews = {
  publicLedger: PublicLedgerView;
  privateMandate?: Mandate;
};

/**
 * trip を提案するときの入力
 *
 * Wave 1 では preferences は定数
 */
export type ProposeTripInput = {
  userId: UserId;
  eventId: CalendarEventId;
  locale: Locale;
  preferences: TravelerPreferences;
  now: IsoDateTime;
};

/**
 * 支払い済みの trip をカレンダーに書き戻すときの入力
 *
 * 文言のローカライズは呼び出し側が行う
 */
export type WriteBackInput = {
  userId: UserId;
  tripId: TripId;
  text: EventText;
  now: IsoDateTime;
};

/**
 * ダッシュボードを読み込む (mandate のリンク -> mandate、期間内の予定、trip)
 */
export const loadDashboard = async (
  _userId: UserId,
  _range: DateRange,
  _deps: SecretaryDeps,
): Promise<Result<Dashboard, SecretaryError>> => {
  return err({ source: "flow", error: { kind: "noMandate" } });
};

/**
 * ユーザの mandate を作ってリンクする
 *
 * ユーザがすでに mandate を持っていれば失敗する
 */
export const setUpMandate = async (
  _userId: UserId,
  _draft: MandateDraft,
  _now: IsoDateTime,
  _deps: SecretaryDeps,
): Promise<Result<Mandate, SecretaryError>> => {
  return err({ source: "flow", error: { kind: "noMandate" } });
};

/**
 * 予定 1 件に対して trip を提案する
 *
 * 流れは、予定の取得 -> 解釈 -> 候補の検索 -> 選択 -> 組み立て (検証) -> proposed として保存
 * planner に渡す予算は、ユーザの mandate (支払い枠) の残り
 */
export const proposeTrip = async (
  _input: ProposeTripInput,
  _deps: SecretaryDeps,
): Promise<Result<ProposedTrip, SecretaryError>> => {
  return err({ source: "flow", error: { kind: "noMandate" } });
};

/**
 * 提案済みの trip を承認する
 *
 * プランは store から取り、クライアントからは決して受け取らない
 */
export const approveTrip = async (
  _userId: UserId,
  _tripId: TripId,
  _now: IsoDateTime,
  _deps: SecretaryDeps,
): Promise<Result<ApprovedTrip, SecretaryError>> => {
  return err({ source: "flow", error: { kind: "noMandate" } });
};

/**
 * 承認済みの trip をユーザの mandate のもとで支払う
 *
 * 流れは、承認済み trip の読み込み -> mandate のリンク -> 候補ごとに支払い参照を作って事業者へ承認と送金 -> 全件済んだら paid として保存
 * 途中で失敗したら trip は approved のまま残し、再試行では済んだ候補を `isAuthorized` で飛ばす
 */
export const payForTrip = async (
  _userId: UserId,
  _tripId: TripId,
  _now: IsoDateTime,
  _deps: SecretaryDeps,
): Promise<Result<PaidTrip, SecretaryError>> => {
  return err({ source: "flow", error: { kind: "noMandate" } });
};

/**
 * 支払い済みの trip を予定 1 件としてカレンダーに書き戻し、written として保存する
 */
export const writeBackTrip = async (
  _input: WriteBackInput,
  _deps: SecretaryDeps,
): Promise<Result<WrittenTrip, SecretaryError>> => {
  return err({ source: "flow", error: { kind: "noMandate" } });
};

/**
 * demo 画面向けに、公開台帳のビューとユーザの private な mandate のビューを読み込む
 */
export const loadLedgerViews = async (
  _userId: UserId,
  _deps: SecretaryDeps,
): Promise<Result<LedgerViews, SecretaryError>> => {
  return err({ source: "flow", error: { kind: "noMandate" } });
};
