import type { CalendarEvent, CalendarEventDraft } from "./calendar";
import type {
  CalendarEventId,
  IsoDate,
  IsoDateTime,
  TripId,
} from "./identifiers";
import type { AgeProof } from "./identity";
import type { Authorization, SettlementVisibility } from "./mandate";
import type { TripPlan } from "./plan";

/**
 * 承認のときに選んだ、候補ごとの支払いの公開範囲
 *
 * `lodging` は計画に宿があるとき、`dining` と `leisure` は計画にその場があるときだけ持つ (計画の形と揃える)
 */
export type PaymentVisibility = {
  outbound: SettlementVisibility;
  inbound: SettlementVisibility;
  lodging?: SettlementVisibility;
  dining?: SettlementVisibility;
  leisure?: SettlementVisibility;
};

/**
 * クライアントから受け取る公開範囲の指定
 *
 * 指定の無い候補は公開、計画に無い候補の指定は捨てるので、すべて任意
 */
export type PaymentVisibilityInput = {
  outbound?: SettlementVisibility;
  inbound?: SettlementVisibility;
  lodging?: SettlementVisibility;
  dining?: SettlementVisibility;
  leisure?: SettlementVisibility;
};

/**
 * 計画を作り直した理由
 *
 * いまは年齢確認が通らなかった場合だけ (`cutoffDate` は証明に使った公開の引数)
 */
export type PlanRevisionReason = {
  kind: "ageNotVerified";
  ageLimit: number;
  cutoffDate: IsoDate;
};

/**
 * 秘書が計画を作り直した記録
 *
 * `previous` は作り直す前の提案と、承認のときに選んでいた公開範囲
 * 会話の履歴を再読み込み後も出すために trip に残し、承認以降も引き継ぐ
 */
export type PlanRevision = {
  reason: PlanRevisionReason;
  previous: {
    plan: TripPlan;
    proposedAt: IsoDateTime;
    visibility: PaymentVisibility;
  };
  revisedAt: IsoDateTime;
};

/**
 * 秘書が提案したプラン
 *
 * まだ何も確定していない
 */
export type ProposedTrip = {
  status: "proposed";
  id: TripId;
  event: CalendarEvent;
  plan: TripPlan;
  proposedAt: IsoDateTime;

  /** 作り直した提案なら、その記録 */
  revision?: PlanRevision;
};

/**
 * ユーザが承認したプラン
 *
 * 支払えるのは承認済みの出張だけ
 * `visibility` は承認のときに候補ごとに選んだ公開範囲で、支払いはこれに従う
 * `authorizations` は候補ごとの支払いのうち済んだもので、承認直後は空
 * 途中で失敗した支払いを再試行するとき、済んだ候補を飛ばすためにここに残す
 */
export type ApprovedTrip = {
  status: "approved";
  id: TripId;
  event: CalendarEvent;
  plan: TripPlan;
  proposedAt: IsoDateTime;
  approvedAt: IsoDateTime;
  visibility: PaymentVisibility;
  authorizations: readonly Authorization[];

  /** 成人の証明 (計画が年齢制限つきの候補を含むときだけ) */
  ageProof?: AgeProof;

  /** 承認した提案が作り直したものなら、その記録 */
  revision?: PlanRevision;
};

/**
 * ユーザの mandate のもとで候補ごとの支払いがすべて承認され、送金された出張
 *
 * `authorizations` は計画の候補 (往路、復路、あれば宿泊、飲食、レジャー) と同じ数になる
 */
export type PaidTrip = {
  status: "paid";
  id: TripId;
  event: CalendarEvent;
  plan: TripPlan;
  proposedAt: IsoDateTime;
  approvedAt: IsoDateTime;
  visibility: PaymentVisibility;
  authorizations: readonly Authorization[];

  /** 成人の証明 (承認のときのものを引き継ぐ) */
  ageProof?: AgeProof;

  /** 作り直しの記録 (承認のときのものを引き継ぐ) */
  revision?: PlanRevision;
  paidAt: IsoDateTime;
};

/**
 * ユーザのカレンダーに書き戻された支払い済みの出張
 */
export type WrittenTrip = {
  status: "written";
  id: TripId;
  event: CalendarEvent;
  plan: TripPlan;
  proposedAt: IsoDateTime;
  approvedAt: IsoDateTime;
  visibility: PaymentVisibility;
  authorizations: readonly Authorization[];

  /** 成人の証明 (承認のときのものを引き継ぐ) */
  ageProof?: AgeProof;

  /** 作り直しの記録 (承認のときのものを引き継ぐ) */
  revision?: PlanRevision;
  paidAt: IsoDateTime;
  writtenEventId: CalendarEventId;
  writtenAt: IsoDateTime;
};

/**
 * 出張が取りうるすべての状態
 *
 * 永続化されるのは `status` タグ
 */
export type Trip = ProposedTrip | ApprovedTrip | PaidTrip | WrittenTrip;

/**
 * 永続化される出張の状態
 */
export type TripStatus = "proposed" | "approved" | "paid" | "written";

/**
 * カレンダーに書き戻す予定のロケール別の文言
 *
 * UI の境界で作られる
 */
export type EventText = {
  title: string;
  description: string;
};

/**
 * 計画のすべての候補を公開にした公開範囲
 *
 * トグルの既定値で、非公開に対応していない adapter が唯一取れる形
 */
export const allPublic = (plan: TripPlan): PaymentVisibility => {
  const chosen: SettlementVisibility = "public";

  return {
    outbound: chosen,
    inbound: chosen,
    ...(plan.lodging === undefined ? {} : { lodging: chosen }),
    ...(plan.dining === undefined ? {} : { dining: chosen }),
    ...(plan.leisure === undefined ? {} : { leisure: chosen }),
  };
};

/**
 * クライアントの指定を計画の形に合わせた公開範囲にする
 *
 * すべて公開を土台に指定で上書きし、計画に無い候補 (日帰りの宿、飲食やレジャーの無い計画のその指定) は捨てる
 */
export const visibilityFor = (
  plan: TripPlan,
  requested: PaymentVisibilityInput,
): PaymentVisibility => {
  const base = allPublic(plan);

  return {
    outbound: requested.outbound ?? base.outbound,
    inbound: requested.inbound ?? base.inbound,
    ...(base.lodging === undefined
      ? {}
      : { lodging: requested.lodging ?? base.lodging }),
    ...(base.dining === undefined
      ? {}
      : { dining: requested.dining ?? base.dining }),
    ...(base.leisure === undefined
      ? {}
      : { leisure: requested.leisure ?? base.leisure }),
  };
};

/**
 * ユーザの承認と、そのとき選んだ候補ごとの公開範囲を記録する
 *
 * 計画が年齢制限つきの候補を含むときは、通った成人の証明を `ageProof` として残す
 * 作り直した提案の承認なら、その記録 (`revision`) も引き継ぐ
 */
export const markApproved = (
  trip: ProposedTrip,
  approvedAt: IsoDateTime,
  visibility: PaymentVisibility,
  ageProof?: AgeProof,
): ApprovedTrip => {
  return {
    ...trip,
    status: "approved",
    approvedAt,
    visibility,
    authorizations: [],
    ...(ageProof === undefined ? {} : { ageProof }),
  };
};

/**
 * 候補ごとの支払いがすべて済んだことを記録する
 *
 * `authorizations` は計画の候補と同じ数で、順序は往路、復路、宿泊、飲食、レジャー
 */
export const markPaid = (
  trip: ApprovedTrip,
  authorizations: readonly Authorization[],
  paidAt: IsoDateTime,
): PaidTrip => {
  return { ...trip, status: "paid", authorizations, paidAt };
};

/**
 * カレンダーへの書き戻しを記録する
 */
export const markWritten = (
  trip: PaidTrip,
  writtenEventId: CalendarEventId,
  writtenAt: IsoDateTime,
): WrittenTrip => {
  return { ...trip, status: "written", writtenEventId, writtenAt };
};

/**
 * 支払い済みの出張のカレンダーの予定を組み立てる (出発から到着まで、場所は目的地)
 */
export const calendarDraftForTrip = (
  trip: PaidTrip,
  text: EventText,
): CalendarEventDraft => {
  return {
    title: text.title,
    when: {
      kind: "timed",
      start: trip.plan.outbound.departAt,
      end: trip.plan.inbound.arriveAt,
    },
    location: trip.plan.intent.destination,
    description: text.description,
  };
};
