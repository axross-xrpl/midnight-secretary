import { match } from "ts-pattern";
import type {
  CalendarError,
  CalendarEvent,
  DateRange,
} from "@/domain/calendar";
import type {
  CatalogError,
  LodgingOffer,
  OfferSet,
  PlaceOffer,
  TransportOffer,
} from "@/domain/catalog";
import { withoutAgeRestrictedDining } from "@/domain/catalog";
import { yearsBefore } from "@/domain/dates";
import type {
  CalendarEventId,
  IsoDate,
  IsoDateTime,
  MandateId,
  TripId,
  UserId,
} from "@/domain/identifiers";
import type {
  AdultProofOutcome,
  AgeProof,
  AgeRegistration,
  IdentityError,
} from "@/domain/identity";
import type { Locale } from "@/domain/locale";
import type {
  Mandate,
  MandateDraft,
  MandateError,
  PublicLedgerView,
  SettlementVisibility,
} from "@/domain/mandate";
import { remainingAllowance } from "@/domain/mandate";
import { paymentRefFor } from "@/domain/mandate.parse";
import type { Money, MoneyError } from "@/domain/money";
import type {
  AdultRequirement,
  PlanAssemblyError,
  TravelerPreferences,
  TripIntent,
  TripPlan,
} from "@/domain/plan";
import { adultRequirementOf, assemblePlan, offerQueryFor } from "@/domain/plan";
import type { ChoiceContext, PlannerError } from "@/domain/planner";
import type { ProfileError } from "@/domain/profile";
import type { ConfirmedTrip, StoreError } from "@/domain/store";
import type {
  ApprovedTrip,
  EventText,
  PaidTrip,
  PaymentVisibility,
  PaymentVisibilityInput,
  PlanRevisionReason,
  ProposedTrip,
  Trip,
  WrittenTrip,
} from "@/domain/trip";
import {
  calendarDraftForTrip,
  markApproved,
  markPaid,
  markWritten,
  visibilityFor,
} from "@/domain/trip";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import type { SecretaryDeps } from "./deps";
import type { FlowError, SecretaryError } from "./errors";
import { DEFAULT_PREFERENCES } from "./preferences";

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
 * 好みはプロフィールから読むので受け取らない
 */
export type ProposeTripInput = {
  userId: UserId;
  eventId: CalendarEventId;
  locale: Locale;
  now: IsoDateTime;
};

/**
 * trip を承認するときの入力
 */
export type ApproveTripInput = {
  userId: UserId;
  tripId: TripId;
  requested: PaymentVisibilityInput;
  now: IsoDateTime;
};

/**
 * 承認の結果
 *
 * 証明が要らないか通れば承認済み、通らなければ記録を付けた提案済みのまま (組み直しは別の 1 手)
 * 証明が通らないことは失敗ではなく秘書の次の問いなので、Result の ok 側に置く
 */
export type ApprovalOutcome =
  | { kind: "approved"; trip: ApprovedTrip }
  | { kind: "ageNotVerified"; trip: ProposedTrip };

/**
 * 年齢の証明が通らなかった trip を、年齢制限のない候補で組み直すときの入力
 *
 * `locale` は planner の呼び直しに要る
 * 好みはプロフィールから読むので受け取らない
 */
export type ReplanTripInput = {
  userId: UserId;
  tripId: TripId;
  locale: Locale;
  now: IsoDateTime;
};

/**
 * 支払い済みの出張から、カレンダーに書き戻す予定の文言を作る
 *
 * UI の境界 (Route Handler) が next-intl で組み立てる
 */
export type RenderEventText = (trip: PaidTrip) => EventText;

/**
 * 支払い済みの trip をカレンダーに書き戻すときの入力
 *
 * 文言のローカライズは呼び出し側が `renderText` で行う
 */
export type WriteBackInput = {
  userId: UserId;
  tripId: TripId;
  renderText: RenderEventText;
  now: IsoDateTime;
};

/**
 * 書き戻しの結果
 *
 * `confirmedStoreError` は確定旅程を DB に写すのに失敗したときだけ入る
 * カレンダーには書けているので書き戻し自体は成功で、画面はこの失敗を補足として出す
 */
export type WriteBackResult = {
  trip: WrittenTrip;
  confirmedStoreError?: StoreError;
};

// 交通、宿泊、飲食、レジャーのどれも同じ形で支払うので、支払いに要る 3 つと、承認で選んだその候補の公開範囲だけを見る
type Payable = Pick<
  TransportOffer | LodgingOffer | PlaceOffer,
  "id" | "price" | "payee"
> & {
  visibility: SettlementVisibility;
};

// 候補 1 件の支払いに要る、trip 以外のもの
type PaymentContext = {
  userId: UserId;
  mandateId: MandateId;
  now: IsoDateTime;
  deps: SecretaryDeps;
};

const fromCalendar = (error: CalendarError): SecretaryError => {
  return { source: "calendar", error };
};

const fromCatalog = (error: CatalogError): SecretaryError => {
  return { source: "catalog", error };
};

const fromPlanner = (error: PlannerError): SecretaryError => {
  return { source: "planner", error };
};

const fromPlan = (error: PlanAssemblyError): SecretaryError => {
  return { source: "plan", error };
};

const fromMandate = (error: MandateError): SecretaryError => {
  return { source: "mandate", error };
};

const fromMoney = (error: MoneyError): SecretaryError => {
  return { source: "money", error };
};

const fromStore = (error: StoreError): SecretaryError => {
  return { source: "store", error };
};

const fromFlow = (error: FlowError): SecretaryError => {
  return { source: "flow", error };
};

const fromIdentity = (error: IdentityError): SecretaryError => {
  return { source: "identity", error };
};

const fromProfile = (error: ProfileError): SecretaryError => {
  return { source: "profile", error };
};

/**
 * ユーザにリンクされた mandate を port から読む
 *
 * リンクが無いか、リンク先を mandate の port が知らないときは undefined
 * port が知らないリンクは「mandate が無い」と同じに扱い、setUpMandate で作り直せるようにする
 */
const linkedMandate = async (
  userId: UserId,
  deps: SecretaryDeps,
): Promise<Result<Mandate | undefined, SecretaryError>> => {
  const link = await deps.store.getMandateLink(userId);

  if (!link.ok) {
    return err(fromStore(link.error));
  }

  if (link.value === undefined) {
    return ok(undefined);
  }

  const mandate = await deps.mandate.readMandate(link.value.mandateId);

  if (!mandate.ok) {
    return err(fromMandate(mandate.error));
  }

  return ok(mandate.value);
};

// 出張が無いことは port の失敗ではなく flow の失敗なので、undefined をここで畳む
const loadTrip = async (
  userId: UserId,
  tripId: TripId,
  deps: SecretaryDeps,
): Promise<Result<Trip, SecretaryError>> => {
  const trip = await deps.store.getTrip(userId, tripId);

  if (!trip.ok) {
    return err(fromStore(trip.error));
  }

  if (trip.value === undefined) {
    return err(fromFlow({ kind: "tripNotFound", tripId }));
  }

  return ok(trip.value);
};

// 同じ予定に対する出張は多くても 1 件なので、提案済みならその id を使い回して上書きする
const tripIdForEvent = async (
  input: ProposeTripInput,
  deps: SecretaryDeps,
): Promise<Result<TripId, SecretaryError>> => {
  const trips = await deps.store.listTrips(input.userId);

  if (!trips.ok) {
    return err(fromStore(trips.error));
  }

  const existing = trips.value.find((trip) => trip.event.id === input.eventId);

  if (existing === undefined) {
    return ok(deps.newTripId());
  }

  if (existing.status !== "proposed") {
    return err(
      fromFlow({
        kind: "eventAlreadyArranged",
        eventId: input.eventId,
        tripId: existing.id,
      }),
    );
  }

  return ok(existing.id);
};

// planner に渡す予算は、ユーザの mandate (支払い枠) の残り
// mandate が無ければ計画を作れないので、提案でも作り直しでも先に確かめる
const budgetOf = async (
  userId: UserId,
  deps: SecretaryDeps,
): Promise<Result<Money, SecretaryError>> => {
  const mandate = await linkedMandate(userId, deps);

  if (!mandate.ok) {
    return mandate;
  }

  if (mandate.value === undefined) {
    return err(fromFlow({ kind: "noMandate" }));
  }

  const budget = remainingAllowance(mandate.value);

  if (!budget.ok) {
    return err(fromMoney(budget.error));
  }

  return ok(budget.value);
};

// planner に渡す好みをプロフィールから読む
// プロフィールが無いユーザにも計画は作れるので、好みが無ければ既定値で進める
const preferencesOf = async (
  userId: UserId,
  deps: SecretaryDeps,
): Promise<Result<TravelerPreferences, SecretaryError>> => {
  const preferences = await deps.profile.readPreferences(userId);

  if (!preferences.ok) {
    return err(fromProfile(preferences.error));
  }

  return ok(preferences.value ?? DEFAULT_PREFERENCES);
};

// 候補の集合から planner に選ばせ、その選択を候補と突き合わせて計画に組み立てる
// 最初の提案と、年齢確認が通らなかったときの作り直しで共通の 2 段
const planFrom = async (
  intent: TripIntent,
  offers: OfferSet,
  context: ChoiceContext,
  deps: SecretaryDeps,
): Promise<Result<TripPlan, SecretaryError>> => {
  const choice = await deps.planner.choosePlan(intent, offers, context);

  if (!choice.ok) {
    return err(fromPlanner(choice.error));
  }

  const plan = assemblePlan(intent, offers, choice.value, context.budget);

  if (!plan.ok) {
    return err(fromPlan(plan.error));
  }

  return ok(plan.value);
};

// 支払いの順は往路、復路、あれば宿泊、あれば飲食、あればレジャー
// 宿、飲食、レジャーの公開範囲は計画にその候補があるときだけ選べるので、無い指定は公開に倒す
const payablesOf = (
  plan: TripPlan,
  visibility: PaymentVisibility,
): readonly Payable[] => {
  const outbound: Payable = {
    ...plan.outbound,
    visibility: visibility.outbound,
  };
  const inbound: Payable = { ...plan.inbound, visibility: visibility.inbound };
  const lodging: readonly Payable[] =
    plan.lodging === undefined
      ? []
      : [{ ...plan.lodging, visibility: visibility.lodging ?? "public" }];
  const dining: readonly Payable[] =
    plan.dining === undefined
      ? []
      : [{ ...plan.dining, visibility: visibility.dining ?? "public" }];
  const leisure: readonly Payable[] =
    plan.leisure === undefined
      ? []
      : [{ ...plan.leisure, visibility: visibility.leisure ?? "public" }];

  return [outbound, inbound, ...lodging, ...dining, ...leisure];
};

// capability の無い adapter に private を渡さないよう、承認の時点で調べる
const hasPrivate = (visibility: PaymentVisibility): boolean => {
  return [
    visibility.outbound,
    visibility.inbound,
    visibility.lodging,
    visibility.dining,
    visibility.leisure,
  ].some((chosen) => chosen === "private");
};

// 登録済みならそれを、無ければプロフィールの生年月日で登録してから返す (登録は identity ごとに 1 回)
// プロフィールに生年月日が無ければ undefined で、登録できないことをどう扱うかは呼び出し側が決める
const ensureRegistered = async (
  userId: UserId,
  now: IsoDateTime,
  deps: SecretaryDeps,
): Promise<Result<AgeRegistration | undefined, SecretaryError>> => {
  const registered = await deps.identity.readRegistration(userId);

  if (!registered.ok) {
    return err(fromIdentity(registered.error));
  }

  if (registered.value !== undefined) {
    return ok(registered.value);
  }

  const birthDate = await deps.profile.readBirthDate(userId);

  if (!birthDate.ok) {
    return err(fromProfile(birthDate.error));
  }

  if (birthDate.value === undefined) {
    return ok(undefined);
  }

  const registration = await deps.identity.registerBirthDate(
    userId,
    birthDate.value,
    now,
  );

  if (!registration.ok) {
    return err(fromIdentity(registration.error));
  }

  return ok(registration.value);
};

// 出発日の `ageLimit` 年前を cutoff にして、成人であることを証明する
// 「成人ではない」も証明としては成功なので、結果をそのまま呼び出し側に渡す
const proveForTrip = async (
  userId: UserId,
  trip: ProposedTrip,
  requirement: AdultRequirement,
  now: IsoDateTime,
  deps: SecretaryDeps,
): Promise<Result<AdultProofOutcome, SecretaryError>> => {
  const registered = await ensureRegistered(userId, now, deps);

  if (!registered.ok) {
    return registered;
  }

  if (registered.value === undefined) {
    return err(fromFlow({ kind: "birthDateMissing", tripId: trip.id }));
  }

  const outcome = await deps.identity.proveAdult(
    userId,
    yearsBefore(trip.plan.intent.departOn, requirement.ageLimit),
    now,
  );

  if (!outcome.ok) {
    return err(fromIdentity(outcome.error));
  }

  return ok(outcome.value);
};

// 承認を記録して保存する (証明は計画が成人を要したときだけ載る)
const saveApproved = async (
  trip: ProposedTrip,
  visibility: PaymentVisibility,
  ageProof: AgeProof | undefined,
  input: ApproveTripInput,
  deps: SecretaryDeps,
): Promise<Result<ApprovalOutcome, SecretaryError>> => {
  const approved = markApproved(trip, input.now, visibility, ageProof);
  const saved = await deps.store.putTrip(input.userId, approved);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  return ok({ kind: "approved", trip: approved });
};

// 証明が通らなかったことを trip に記録して、提案済みのまま保存する (計画は変えない)
// 承認で選んでいた公開範囲は組み直しの記録に写すので、ここで残しておく
const saveAgeNotVerified = async (
  trip: ProposedTrip,
  visibility: PaymentVisibility,
  requirement: AdultRequirement,
  cutoffDate: IsoDate,
  input: ApproveTripInput,
  deps: SecretaryDeps,
): Promise<Result<ApprovalOutcome, SecretaryError>> => {
  const rejected: ProposedTrip = {
    ...trip,
    failedAgeCheck: {
      ageLimit: requirement.ageLimit,
      cutoffDate,
      visibility,
      checkedAt: input.now,
    },
  };
  const saved = await deps.store.putTrip(input.userId, rejected);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  return ok({ kind: "ageNotVerified", trip: rejected });
};

// 飲食から年齢確認を要する候補を除いて計画を作り直し、同じ id の提案として保存する
// 作り直した計画が再び成人を要することは無いので、証明の記録は新しい提案に付けない
const reviseWithoutAgeRestricted = async (
  trip: ProposedTrip,
  visibility: PaymentVisibility,
  reason: PlanRevisionReason,
  input: ReplanTripInput,
  deps: SecretaryDeps,
): Promise<Result<ProposedTrip, SecretaryError>> => {
  const budget = await budgetOf(input.userId, deps);

  if (!budget.ok) {
    return budget;
  }

  const preferences = await preferencesOf(input.userId, deps);

  if (!preferences.ok) {
    return preferences;
  }

  const intent = trip.plan.intent;
  const offers = await deps.catalog.findOffers(
    offerQueryFor(intent, preferences.value),
  );

  if (!offers.ok) {
    return err(fromCatalog(offers.error));
  }

  const plan = await planFrom(
    intent,
    withoutAgeRestrictedDining(offers.value),
    {
      locale: input.locale,
      preferences: preferences.value,
      budget: budget.value,
    },
    deps,
  );

  if (!plan.ok) {
    return plan;
  }

  const revised: ProposedTrip = {
    status: "proposed",
    id: trip.id,
    event: trip.event,
    plan: plan.value,
    proposedAt: input.now,
    revision: {
      reason,
      previous: {
        plan: trip.plan,
        proposedAt: trip.proposedAt,
        visibility,
      },
      revisedAt: input.now,
    },
  };
  const saved = await deps.store.putTrip(input.userId, revised);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  return ok(revised);
};

// 証明の生成は直列が前提なので、前の候補の結果を待ってから次の候補を出す
// 済んだ候補は authorizations に残っているので、再試行では飛ばす
// 承認の直後に putTrip が失敗するとその候補は台帳にだけ残り、次の再試行は alreadyAuthorized で止まる (Wave 1 は手で直す前提)
const payNext = async (
  previous: Promise<Result<ApprovedTrip, SecretaryError>>,
  offer: Payable,
  context: PaymentContext,
): Promise<Result<ApprovedTrip, SecretaryError>> => {
  const settled = await previous;

  if (!settled.ok) {
    return settled;
  }

  const trip = settled.value;
  const paymentRef = paymentRefFor(trip.id, offer.id);
  const done = trip.authorizations.some(
    (authorization) => authorization.paymentRef === paymentRef,
  );

  if (done) {
    return settled;
  }

  const authorized = await context.deps.mandate.authorizePayment({
    mandateId: context.mandateId,
    paymentRef,
    amount: offer.price,
    recipient: offer.payee,
    visibility: offer.visibility,
    now: context.now,
  });

  if (!authorized.ok) {
    return err(fromMandate(authorized.error));
  }

  const paying: ApprovedTrip = {
    ...trip,
    authorizations: [...trip.authorizations, authorized.value],
  };
  const saved = await context.deps.store.putTrip(context.userId, paying);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  return ok(paying);
};

/**
 * ダッシュボードを読み込む (mandate のリンク -> mandate、期間内の予定、trip)
 */
export const loadDashboard = async (
  userId: UserId,
  range: DateRange,
  deps: SecretaryDeps,
): Promise<Result<Dashboard, SecretaryError>> => {
  const mandate = await linkedMandate(userId, deps);

  if (!mandate.ok) {
    return mandate;
  }

  const events = await deps.calendar.listEvents(range);

  if (!events.ok) {
    return err(fromCalendar(events.error));
  }

  const trips = await deps.store.listTrips(userId);

  if (!trips.ok) {
    return err(fromStore(trips.error));
  }

  return ok({
    ...(mandate.value === undefined ? {} : { mandate: mandate.value }),
    events: events.value,
    trips: trips.value,
  });
};

/**
 * ユーザの trip を読み込む
 *
 * `loadDashboard` からカレンダーと mandate の読み取りを外したもの (予定一覧の手配中と確定旅程が使う)
 */
export const loadTrips = async (
  userId: UserId,
  deps: SecretaryDeps,
): Promise<Result<readonly Trip[], SecretaryError>> => {
  const trips = await deps.store.listTrips(userId);

  if (!trips.ok) {
    return err(fromStore(trips.error));
  }

  return ok(trips.value);
};

/**
 * ユーザの確定旅程を読み込む
 *
 * 進行中の出張とは別の読み取りで、確定旅程タブが使う
 * 並びは store が返す出発日の新しい順
 */
export const loadConfirmedTrips = async (
  userId: UserId,
  deps: SecretaryDeps,
): Promise<Result<readonly ConfirmedTrip[], SecretaryError>> => {
  const confirmed = await deps.store.listConfirmedTrips(userId);

  if (!confirmed.ok) {
    return err(fromStore(confirmed.error));
  }

  return ok(confirmed.value);
};

/**
 * 確定旅程を DB から消す
 *
 * 動作確認とデモのための操作で、消した行は戻らない
 * 手配中の trip (メモリ) には触れない
 */
export const deleteConfirmedTrip = async (
  userId: UserId,
  tripId: TripId,
  deps: SecretaryDeps,
): Promise<Result<void, SecretaryError>> => {
  const deleted = await deps.store.deleteConfirmedTrip(userId, tripId);

  if (!deleted.ok) {
    return err(fromStore(deleted.error));
  }

  return ok(undefined);
};

/**
 * ユーザの mandate を作ってリンクする
 *
 * ユーザがすでに mandate を持っていれば失敗する
 */
export const setUpMandate = async (
  userId: UserId,
  draft: MandateDraft,
  now: IsoDateTime,
  deps: SecretaryDeps,
): Promise<Result<Mandate, SecretaryError>> => {
  const existing = await linkedMandate(userId, deps);

  if (!existing.ok) {
    return existing;
  }

  if (existing.value !== undefined) {
    return err(
      fromFlow({ kind: "mandateExists", mandateId: existing.value.id }),
    );
  }

  const created = await deps.mandate.createMandate(draft);

  if (!created.ok) {
    return err(fromMandate(created.error));
  }

  const linked = await deps.store.putMandateLink(userId, {
    mandateId: created.value.id,
    linkedAt: now,
  });

  if (!linked.ok) {
    return err(fromStore(linked.error));
  }

  return ok(created.value);
};

/**
 * 予定 1 件に対して trip を提案する
 *
 * 流れは、予定の取得 -> 解釈 -> 候補の検索 -> 選択 -> 組み立て (検証) -> proposed として保存
 * planner に渡す予算は、ユーザの mandate (支払い枠) の残り
 * planner に渡す好みはプロフィールから読み、無ければ既定値を使う
 * mandate の確認を planner より前に置くのは、LLM を呼ぶ前に確実に失敗するものを弾くため
 */
export const proposeTrip = async (
  input: ProposeTripInput,
  deps: SecretaryDeps,
): Promise<Result<ProposedTrip, SecretaryError>> => {
  const tripId = await tripIdForEvent(input, deps);

  if (!tripId.ok) {
    return tripId;
  }

  const event = await deps.calendar.getEvent(input.eventId);

  if (!event.ok) {
    return err(fromCalendar(event.error));
  }

  if (event.value === undefined) {
    return err(fromFlow({ kind: "eventNotFound", eventId: input.eventId }));
  }

  const budget = await budgetOf(input.userId, deps);

  if (!budget.ok) {
    return budget;
  }

  const preferences = await preferencesOf(input.userId, deps);

  if (!preferences.ok) {
    return preferences;
  }

  const destinations = await deps.catalog.listDestinations();

  if (!destinations.ok) {
    return err(fromCatalog(destinations.error));
  }

  const intent = await deps.planner.interpretEvent(event.value, {
    locale: input.locale,
    now: input.now,
    knownDestinations: destinations.value,
  });

  if (!intent.ok) {
    return err(fromPlanner(intent.error));
  }

  const offers = await deps.catalog.findOffers(
    offerQueryFor(intent.value, preferences.value),
  );

  if (!offers.ok) {
    return err(fromCatalog(offers.error));
  }

  const plan = await planFrom(
    intent.value,
    offers.value,
    {
      locale: input.locale,
      preferences: preferences.value,
      budget: budget.value,
    },
    deps,
  );

  if (!plan.ok) {
    return plan;
  }

  const trip: ProposedTrip = {
    status: "proposed",
    id: tripId.value,
    event: event.value,
    plan: plan.value,
    proposedAt: input.now,
  };
  const saved = await deps.store.putTrip(input.userId, trip);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  return ok(trip);
};

/**
 * 提案済みの trip を、候補ごとの公開範囲つきで承認する
 *
 * プランは store から取り、クライアントからは公開範囲だけを受け取る
 * 計画に無い候補 (日帰りの宿、飲食やレジャーの無い計画のその指定) は捨て、指定の無い候補は公開にする
 * adapter が非公開に対応していないのに非公開があれば `flow.privateSettlementUnsupported` で、trip は提案済みのまま
 * 計画が成人を要する候補を含むなら、出発日の `ageLimit` 年前を cutoff にした証明を取る
 * 通れば証明を trip に残して承認する
 * 通らなければ計画は変えず、`failedAgeCheck` に記録して提案済みのまま保存する (組み直しは `replanTrip`)
 * 生年月日が無ければ `flow.birthDateMissing` で、trip は提案済みのまま
 * 公開範囲の検査は I/O を伴わないので、identity に問い合わせる証明より先に行う
 */
export const approveTrip = async (
  input: ApproveTripInput,
  deps: SecretaryDeps,
): Promise<Result<ApprovalOutcome, SecretaryError>> => {
  const trip = await loadTrip(input.userId, input.tripId, deps);

  if (!trip.ok) {
    return trip;
  }

  if (trip.value.status !== "proposed") {
    return err(
      fromFlow({
        kind: "wrongStatus",
        tripId: input.tripId,
        expected: "proposed",
        actual: trip.value.status,
      }),
    );
  }

  const proposed = trip.value;
  const visibility = visibilityFor(proposed.plan, input.requested);

  if (hasPrivate(visibility) && !deps.mandate.capabilities.privateSettlement) {
    return err(
      fromFlow({
        kind: "privateSettlementUnsupported",
        tripId: input.tripId,
      }),
    );
  }

  const requirement = adultRequirementOf(proposed.plan);

  if (requirement === undefined) {
    return saveApproved(proposed, visibility, undefined, input, deps);
  }

  const outcome = await proveForTrip(
    input.userId,
    proposed,
    requirement,
    input.now,
    deps,
  );

  if (!outcome.ok) {
    return outcome;
  }

  return match(outcome.value)
    .returnType<Promise<Result<ApprovalOutcome, SecretaryError>>>()
    .with({ kind: "adult" }, ({ proof }) =>
      saveApproved(proposed, visibility, proof, input, deps),
    )
    .with({ kind: "notAdult" }, ({ cutoffDate }) =>
      saveAgeNotVerified(
        proposed,
        visibility,
        requirement,
        cutoffDate,
        input,
        deps,
      ),
    )
    .exhaustive();
};

/**
 * 年齢の証明が通らなかった提案済みの trip を、飲食の候補から年齢確認を要するものを除いて組み直す
 *
 * 同じ id の提案として保存し、`revision` に理由と前の計画と承認で選んでいた公開範囲を残す
 * 提案済みでなければ `flow.wrongStatus`、証明が通らなかった記録が無ければ `flow.replanNotNeeded`
 */
export const replanTrip = async (
  input: ReplanTripInput,
  deps: SecretaryDeps,
): Promise<Result<ProposedTrip, SecretaryError>> => {
  const trip = await loadTrip(input.userId, input.tripId, deps);

  if (!trip.ok) {
    return trip;
  }

  if (trip.value.status !== "proposed") {
    return err(
      fromFlow({
        kind: "wrongStatus",
        tripId: input.tripId,
        expected: "proposed",
        actual: trip.value.status,
      }),
    );
  }

  const proposed = trip.value;
  const failed = proposed.failedAgeCheck;

  if (failed === undefined) {
    return err(fromFlow({ kind: "replanNotNeeded", tripId: input.tripId }));
  }

  return reviseWithoutAgeRestricted(
    proposed,
    failed.visibility,
    {
      kind: "ageNotVerified",
      ageLimit: failed.ageLimit,
      cutoffDate: failed.cutoffDate,
    },
    input,
    deps,
  );
};

/**
 * 承認済みの trip をユーザの mandate のもとで支払う
 *
 * 流れは、承認済み trip の読み込み -> mandate のリンク -> 候補ごとに支払い参照を作って事業者へ承認と送金 -> 全件済んだら paid として保存
 * 途中で失敗したら trip は approved のまま残し、再試行では `authorizations` に残っている候補を飛ばす
 */
export const payForTrip = async (
  userId: UserId,
  tripId: TripId,
  now: IsoDateTime,
  deps: SecretaryDeps,
): Promise<Result<PaidTrip, SecretaryError>> => {
  const trip = await loadTrip(userId, tripId, deps);

  if (!trip.ok) {
    return trip;
  }

  if (trip.value.status !== "approved") {
    return err(
      fromFlow({
        kind: "wrongStatus",
        tripId,
        expected: "approved",
        actual: trip.value.status,
      }),
    );
  }

  const mandate = await linkedMandate(userId, deps);

  if (!mandate.ok) {
    return mandate;
  }

  if (mandate.value === undefined) {
    return err(fromFlow({ kind: "noMandate" }));
  }

  const approved = trip.value;
  const context: PaymentContext = {
    userId,
    mandateId: mandate.value.id,
    now,
    deps,
  };
  const settled = await payablesOf(approved.plan, approved.visibility).reduce<
    Promise<Result<ApprovedTrip, SecretaryError>>
  >(
    (previous, offer) => payNext(previous, offer, context),
    Promise.resolve(ok(approved)),
  );

  if (!settled.ok) {
    return settled;
  }

  const paid = markPaid(settled.value, settled.value.authorizations, now);
  const saved = await deps.store.putTrip(userId, paid);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  return ok(paid);
};

/**
 * 支払い済みの trip を予定 1 件としてカレンダーに書き戻し、written として保存する
 *
 * 最後に確定旅程を DB に写す
 * 写すのに失敗しても書き戻し自体は成功として返す (カレンダーの登録は冪等でないので、やり直させると予定が二重になる)
 */
export const writeBackTrip = async (
  input: WriteBackInput,
  deps: SecretaryDeps,
): Promise<Result<WriteBackResult, SecretaryError>> => {
  const trip = await loadTrip(input.userId, input.tripId, deps);

  if (!trip.ok) {
    return trip;
  }

  if (trip.value.status !== "paid") {
    return err(
      fromFlow({
        kind: "wrongStatus",
        tripId: input.tripId,
        expected: "paid",
        actual: trip.value.status,
      }),
    );
  }

  const paid = trip.value;
  const inserted = await deps.calendar.insertEvent(
    calendarDraftForTrip(paid, input.renderText(paid)),
  );

  if (!inserted.ok) {
    return err(fromCalendar(inserted.error));
  }

  const written = markWritten(paid, inserted.value.id, input.now);
  const saved = await deps.store.putTrip(input.userId, written);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  const confirmed = await deps.store.putConfirmedTrip(
    input.userId,
    written,
    deps.catalog.resolveServiceIds,
  );

  if (!confirmed.ok) {
    return ok({ trip: written, confirmedStoreError: confirmed.error });
  }

  return ok({ trip: written });
};

/**
 * demo 画面向けに、公開台帳のビューとユーザの private な mandate のビューを読み込む
 */
export const loadLedgerViews = async (
  userId: UserId,
  deps: SecretaryDeps,
): Promise<Result<LedgerViews, SecretaryError>> => {
  const publicLedger = await deps.mandate.readPublicLedger();

  if (!publicLedger.ok) {
    return err(fromMandate(publicLedger.error));
  }

  const privateMandate = await linkedMandate(userId, deps);

  if (!privateMandate.ok) {
    return privateMandate;
  }

  return ok({
    publicLedger: publicLedger.value,
    ...(privateMandate.value === undefined
      ? {}
      : { privateMandate: privateMandate.value }),
  });
};
