import { match } from "ts-pattern";
import type {
  CalendarError,
  CalendarEvent,
  DateRange,
} from "@/domain/calendar";
import type {
  CatalogError,
  LodgingOffer,
  PlaceOffer,
  TransportOffer,
} from "@/domain/catalog";
import { yearsBefore } from "@/domain/dates";
import type {
  CalendarEventId,
  IsoDateTime,
  MandateId,
  TripId,
  UserId,
} from "@/domain/identifiers";
import type {
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
import type { MoneyError } from "@/domain/money";
import type {
  AdultRequirement,
  PlanAssemblyError,
  TravelerPreferences,
  TripPlan,
} from "@/domain/plan";
import { adultRequirementOf, assemblePlan, offerQueryFor } from "@/domain/plan";
import type { PlannerError } from "@/domain/planner";
import type { ProfileError } from "@/domain/profile";
import type { StoreError } from "@/domain/store";
import type {
  ApprovedTrip,
  EventText,
  PaidTrip,
  PaymentVisibility,
  PaymentVisibilityInput,
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
// 結果が「成人ではない」のは port の失敗ではなく flow の失敗で、trip は提案済みのまま
const proveForTrip = async (
  userId: UserId,
  trip: ProposedTrip,
  requirement: AdultRequirement,
  now: IsoDateTime,
  deps: SecretaryDeps,
): Promise<Result<AgeProof, SecretaryError>> => {
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

  return match(outcome.value)
    .returnType<Result<AgeProof, SecretaryError>>()
    .with({ kind: "adult" }, ({ proof }) => ok(proof))
    .with({ kind: "notAdult" }, ({ cutoffDate }) =>
      err(
        fromFlow({
          kind: "ageNotVerified",
          tripId: trip.id,
          ageLimit: requirement.ageLimit,
          cutoffDate,
        }),
      ),
    )
    .exhaustive();
};

// 計画が成人を要しなければ証明は要らない (undefined)
const ageProofFor = async (
  userId: UserId,
  trip: ProposedTrip,
  now: IsoDateTime,
  deps: SecretaryDeps,
): Promise<Result<AgeProof | undefined, SecretaryError>> => {
  const requirement = adultRequirementOf(trip.plan);

  if (requirement === undefined) {
    return ok(undefined);
  }

  return proveForTrip(userId, trip, requirement, now, deps);
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

  const mandate = await linkedMandate(input.userId, deps);

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
    offerQueryFor(intent.value, input.preferences),
  );

  if (!offers.ok) {
    return err(fromCatalog(offers.error));
  }

  const choice = await deps.planner.choosePlan(intent.value, offers.value, {
    locale: input.locale,
    preferences: input.preferences,
    budget: budget.value,
  });

  if (!choice.ok) {
    return err(fromPlanner(choice.error));
  }

  const plan = assemblePlan(
    intent.value,
    offers.value,
    choice.value,
    budget.value,
  );

  if (!plan.ok) {
    return err(fromPlan(plan.error));
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
 * 計画が成人を要する候補を含むなら、出発日の `ageLimit` 年前を cutoff にした証明が通ることを前提にする
 * 未登録なら profile の生年月日で登録してから証明する (登録は 1 回だけ)
 * 通れば証明を trip に残す
 * 落ちれば `flow.ageNotVerified`、生年月日が無ければ `flow.birthDateMissing` で、trip は提案済みのまま
 * 公開範囲の検査は I/O を伴わないので、identity に問い合わせる証明より先に行う
 */
export const approveTrip = async (
  userId: UserId,
  tripId: TripId,
  requested: PaymentVisibilityInput,
  now: IsoDateTime,
  deps: SecretaryDeps,
): Promise<Result<ApprovedTrip, SecretaryError>> => {
  const trip = await loadTrip(userId, tripId, deps);

  if (!trip.ok) {
    return trip;
  }

  if (trip.value.status !== "proposed") {
    return err(
      fromFlow({
        kind: "wrongStatus",
        tripId,
        expected: "proposed",
        actual: trip.value.status,
      }),
    );
  }

  const visibility = visibilityFor(trip.value.plan, requested);

  if (hasPrivate(visibility) && !deps.mandate.capabilities.privateSettlement) {
    return err(fromFlow({ kind: "privateSettlementUnsupported", tripId }));
  }

  const ageProof = await ageProofFor(userId, trip.value, now, deps);

  if (!ageProof.ok) {
    return ageProof;
  }

  const approved = markApproved(trip.value, now, visibility, ageProof.value);
  const saved = await deps.store.putTrip(userId, approved);

  if (!saved.ok) {
    return err(fromStore(saved.error));
  }

  return ok(approved);
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
 */
export const writeBackTrip = async (
  input: WriteBackInput,
  deps: SecretaryDeps,
): Promise<Result<WrittenTrip, SecretaryError>> => {
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

  return ok(written);
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
