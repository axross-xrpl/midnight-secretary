import { match, P } from "ts-pattern";
import type { PaymentVisibilityInput } from "@/domain/trip";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type {
  AgeProofResponse,
  AuthorizationResponse,
  FailedAgeCheckResponse,
  MoneyResponse,
  PaymentVisibilityResponse,
  PlaceOfferResponse,
  PlanRevisionResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
import type { PlanDiff } from "./format";
import {
  adultRequirementOfResponse,
  DEFAULT_AGE_LIMIT,
  diffPlans,
} from "./format";
import type {
  Activity,
  MandateCapabilities,
  RequestFailure,
  Step,
} from "./types";

/**
 * 会話画面が 1 回の描画で見る状態
 *
 * 休止状態は props (サーバが読んだ trip) から、進行中と失敗はクライアントの activity から来る
 * `cap` は支払い枠があればその上限、無ければ固定値の上限で、挨拶に出す
 * `capabilities` は mandate の adapter が扱える支払いの形、`visibility` は提案済みの計画にいま選んでいる公開範囲
 */
export type ChatState = {
  event: ScanEvent;
  cap: MoneyResponse;
  trip?: TripResponse;
  activity: Activity;
  capabilities: MandateCapabilities;
  visibility: PaymentVisibilityInput;
};

/**
 * 計画の行に出す公開範囲
 *
 * 提案済みで選べるときは選択中の値を出すトグル、承認済み以降は記録された値のバッジ
 */
export type PlanVisibility =
  | { mode: "editor"; value: PaymentVisibilityInput; disabled: boolean }
  | { mode: "badges"; value: PaymentVisibilityResponse };

/**
 * 進行中の吹き出しが出す手
 *
 * `approveWithProof` は承認のうち、計画が年齢制限つきの候補を含むので成人の証明も伴うもの
 * 文言のキー `lines.working.*` と同じ軸で、承認に証明が付くかどうかを別のフラグでは持たない
 */
export type WorkingStep = Step | "approveWithProof";

/**
 * 秘書の吹き出し 1 つ
 *
 * `askProof` は年齢確認を求める候補があるときの、証明を送ってよいかの問い
 * `ageRejected` は証明が通らなかったときの説明と、年齢制限のない候補で組み直してよいかの問いで、`place` は使えない候補
 * `ageVerified` は承認の中で通った成人の証明で、`ageLimit` は計画の候補の年齢の下限
 * `working` の `step` は進行中の手で、承認が年齢の証明を伴うときは `approveWithProof`
 */
export type SecretaryLine =
  | { kind: "greeting"; title: string; cap: MoneyResponse }
  | { kind: "ask"; title: string }
  | {
      kind: "proposal";
      title: string;
      plan: TripPlanResponse;
      visibility?: PlanVisibility;

      /** 組み直した提案なら、前の提案との差分 (変わった行に色を付ける) */
      diff?: PlanDiff;
    }
  | { kind: "askProof"; place: PlaceOfferResponse; ageLimit: number }
  | {
      kind: "ageRejected";
      place: PlaceOfferResponse;
      ageLimit: number;
      cutoffDate: string;
    }
  | { kind: "ageVerified"; proof: AgeProofResponse; ageLimit: number }
  | { kind: "askPay" }
  | { kind: "partiallyPaid"; authorizations: readonly AuthorizationResponse[] }
  | { kind: "paid"; authorizations: readonly AuthorizationResponse[] }
  | { kind: "askWriteBack" }
  | {
      kind: "written";
      writtenEventId: string;
      confirmedStoreFailed: boolean;
    }
  | { kind: "working"; step: WorkingStep; title: string }
  | { kind: "failed"; failure: RequestFailure };

/**
 * ユーザの吹き出し 1 つ (押した返答の写し)
 */
export type UserLine =
  | { kind: "propose" }
  | { kind: "approve"; privateCount: number }
  | { kind: "sendProof" }
  | { kind: "replan" }
  | { kind: "pay"; resume: boolean }
  | { kind: "writeBack" };

/**
 * 会話ログの 1 つの吹き出し
 *
 * 秘書の吹き出しの時刻は Trip の `*At` で、ユーザの吹き出しに時刻は出さない
 */
export type Bubble =
  | { speaker: "secretary"; line: SecretaryLine; at?: string }
  | { speaker: "user"; line: UserLine };

/**
 * いま押せる返答 1 つ
 *
 * `sendProof` は年齢の証明を送って承認まで進める返答、`declineProof` は提案に戻る返答
 * `replan` は証明が通らなかった提案を年齢制限のない候補で組み直してもらう返答
 */
export type Reply =
  | { kind: "propose"; eventId: string }
  | { kind: "approve"; trip: TripResponse; visibility: PaymentVisibilityInput }
  | {
      kind: "sendProof";
      trip: TripResponse;
      visibility: PaymentVisibilityInput;
    }
  | { kind: "declineProof" }
  | { kind: "replan"; trip: TripResponse }
  | { kind: "pay"; trip: TripResponse; resume: boolean }
  | { kind: "writeBack"; trip: TripResponse }
  | { kind: "dismiss" };

/**
 * 会話ログと返答
 */
export type Conversation = {
  bubbles: readonly Bubble[];
  replies: readonly Reply[];
};

// 支払い済みと登録済みの trip が共通で持つ、履歴に要るもの
type PaidFacts = {
  plan: TripPlanResponse;
  proposedAt: string;
  approvedAt: string;
  visibility: PaymentVisibilityResponse;
  authorizations: readonly AuthorizationResponse[];
  ageProof?: AgeProofResponse;
  revision?: PlanRevisionResponse;
  paidAt: string;
};

const secretary = (line: SecretaryLine, at?: string): Bubble => {
  return {
    speaker: "secretary",
    line,
    ...(at === undefined ? {} : { at }),
  };
};

const user = (line: UserLine): Bubble => {
  return { speaker: "user", line };
};

// 非公開に選ばれた候補の数 (選択の無い候補は公開なので数えない)
const privateCountOf = (visibility: PaymentVisibilityInput): number => {
  return [
    visibility.outbound,
    visibility.inbound,
    visibility.lodging,
    visibility.dining,
    visibility.leisure,
  ].filter((chosen) => chosen === "private").length;
};

// 非公開を扱えない adapter では選択そのものが無いので、返答にも写しにも空を渡す
const chosenVisibility = (state: ChatState): PaymentVisibilityInput => {
  if (!state.capabilities.privateSettlement) {
    return {};
  }

  return state.visibility;
};

// 提案済みの計画は、adapter が非公開を扱えるときだけトグルを出す
// 承認を押した後 (証明の返事待ちと進行中) は、返答ボタンと同じく操作を止める
const editorVisibilityOf = (state: ChatState): PlanVisibility | undefined => {
  if (!state.capabilities.privateSettlement) {
    return undefined;
  }

  const frozen = match(state.activity)
    .with({ kind: P.union("awaitingConsent", "busy") }, () => true)
    .otherwise(() => false);

  return { mode: "editor", value: state.visibility, disabled: frozen };
};

const badgesOf = (visibility: PaymentVisibilityResponse): PlanVisibility => {
  return { mode: "badges", value: visibility };
};

const proposalOf = (
  event: ScanEvent,
  plan: TripPlanResponse,
  proposedAt: string,
  visibility: PlanVisibility | undefined,
  diff: PlanDiff | undefined,
): Bubble => {
  return secretary(
    {
      kind: "proposal",
      title: event.title,
      plan,
      ...(visibility === undefined ? {} : { visibility }),
      ...(diff === undefined ? {} : { diff }),
    },
    proposedAt,
  );
};

// 組み直した trip のいまの計画は、前の計画との差分を持つ (組み直していなければ無し)
const diffOf = (
  revision: PlanRevisionResponse | undefined,
  plan: TripPlanResponse,
): PlanDiff | undefined => {
  if (revision === undefined) {
    return undefined;
  }

  return diffPlans(revision.previous.plan, plan);
};

// ユーザが承認を押したときの写し (非公開に選んだ件数を持つ)
const approveEcho = (privateCount: number): Bubble => {
  return user({ kind: "approve", privateCount });
};

// 成人を要する計画なら、承認の後に「証明を送ってよいか」の問いが 1 つ挟まる
const askProofOf = (plan: TripPlanResponse): readonly Bubble[] => {
  const requirement = adultRequirementOfResponse(plan);

  if (requirement === undefined) {
    return [];
  }

  return [
    secretary({
      kind: "askProof",
      place: requirement.offer,
      ageLimit: requirement.ageLimit,
    }),
  ];
};

// 承認の 1 手の写し (成人を要する計画では、証明の問いと「証明を送って」の写しまでが 1 手)
const approvalEchoOf = (
  plan: TripPlanResponse,
  privateCount: number,
): readonly Bubble[] => {
  const asked = askProofOf(plan);

  if (asked.length === 0) {
    return [approveEcho(privateCount)];
  }

  return [approveEcho(privateCount), ...asked, user({ kind: "sendProof" })];
};

// 支払いの途中で失敗していれば済んだ候補が残っているので、askPay の代わりに partiallyPaid を出す
const afterApproval = (
  authorizations: readonly AuthorizationResponse[],
  approvedAt: string,
): Bubble => {
  if (authorizations.length === 0) {
    return secretary({ kind: "askPay" }, approvedAt);
  }

  return secretary({ kind: "partiallyPaid", authorizations }, approvedAt);
};

const ageLimitOf = (plan: TripPlanResponse): number => {
  return adultRequirementOfResponse(plan)?.ageLimit ?? DEFAULT_AGE_LIMIT;
};

// 承認の中で成人の証明が通っていれば、承認の写しの直後にその吹き出しを入れる (時刻は証明の時刻)
const ageVerifiedOf = (
  plan: TripPlanResponse,
  ageProof: AgeProofResponse | undefined,
): readonly Bubble[] => {
  if (ageProof === undefined) {
    return [];
  }

  return [
    secretary(
      { kind: "ageVerified", proof: ageProof, ageLimit: ageLimitOf(plan) },
      ageProof.provedAt,
    ),
  ];
};

// 証明が通らなかったときの説明と、年齢制限のない候補で組み直してよいかの問い
// 計画に年齢制限つきの候補が無ければ (起こらないはず) undefined
const ageRejectedOf = (
  plan: TripPlanResponse,
  ageLimit: number,
  cutoffDate: string,
  at: string,
): Bubble | undefined => {
  const requirement = adultRequirementOfResponse(plan);

  if (requirement === undefined) {
    return undefined;
  }

  return secretary(
    { kind: "ageRejected", place: requirement.offer, ageLimit, cutoffDate },
    at,
  );
};

// 提案済みの履歴の、証明が通らなかった記録から導く部分 (承認で選んでいた公開範囲と、組み直しの問い)
type AgeRejection = {
  visibility: PaymentVisibilityResponse;
  asked: Bubble;
};

// 証明が通らなかった記録があり、計画に年齢制限つきの候補があるときだけ
// 候補が無ければ (起こらないはず) 記録が無いのと同じに扱う
const ageRejectionOf = (
  plan: TripPlanResponse,
  failedAgeCheck: FailedAgeCheckResponse | undefined,
): AgeRejection | undefined => {
  if (failedAgeCheck === undefined) {
    return undefined;
  }

  const asked = ageRejectedOf(
    plan,
    failedAgeCheck.ageLimit,
    failedAgeCheck.cutoffDate,
    failedAgeCheck.checkedAt,
  );

  if (asked === undefined) {
    return undefined;
  }

  return { visibility: failedAgeCheck.visibility, asked };
};

// 提案済みの履歴
// 証明が通らなかった提案は、承認で選んだ公開範囲のバッジで出し、承認の写しと組み直しの問いまでを続ける
// そうでなければ提案だけ (トグルは操作できる)
const proposedHistory = (
  state: ChatState,
  plan: TripPlanResponse,
  proposedAt: string,
  rejection: AgeRejection | undefined,
  diff: PlanDiff | undefined,
): readonly Bubble[] => {
  const event = state.event;

  if (rejection === undefined) {
    return [
      proposalOf(event, plan, proposedAt, editorVisibilityOf(state), diff),
    ];
  }

  return [
    proposalOf(event, plan, proposedAt, badgesOf(rejection.visibility), diff),
    ...approvalEchoOf(plan, privateCountOf(rejection.visibility)),
    rejection.asked,
  ];
};

// 作り直した提案の前に、作り直す前の提案から組み直しの問いと「組み直して」の写しまでを置く
// 前の提案の証明の記録は残っていないので、問いの値は作り直しの記録から取る (時刻は作り直した時刻)
// 前の計画に年齢制限つきの候補が無ければ (起こらないはず) 前置きは出さない
const revisionPreludeOf = (
  event: ScanEvent,
  revision: PlanRevisionResponse | undefined,
): readonly Bubble[] => {
  if (revision === undefined) {
    return [];
  }

  const previous = revision.previous;
  const asked = ageRejectedOf(
    previous.plan,
    revision.reason.ageLimit,
    revision.reason.cutoffDate,
    revision.revisedAt,
  );

  if (asked === undefined) {
    return [];
  }

  return [
    proposalOf(
      event,
      previous.plan,
      previous.proposedAt,
      badgesOf(previous.visibility),
      undefined,
    ),
    ...approvalEchoOf(previous.plan, privateCountOf(previous.visibility)),
    asked,
    user({ kind: "replan" }),
  ];
};

const paidHistory = (event: ScanEvent, trip: PaidFacts): readonly Bubble[] => {
  return [
    ...revisionPreludeOf(event, trip.revision),
    proposalOf(
      event,
      trip.plan,
      trip.proposedAt,
      badgesOf(trip.visibility),
      diffOf(trip.revision, trip.plan),
    ),
    ...approvalEchoOf(trip.plan, privateCountOf(trip.visibility)),
    ...ageVerifiedOf(trip.plan, trip.ageProof),
    secretary({ kind: "askPay" }, trip.approvedAt),
    user({ kind: "pay", resume: false }),
    secretary(
      { kind: "paid", authorizations: trip.authorizations },
      trip.paidAt,
    ),
    secretary({ kind: "askWriteBack" }, trip.paidAt),
  ];
};

// 提案から先の履歴を trip の status から作り直す
const historyOf = (state: ChatState, trip: TripResponse): readonly Bubble[] => {
  const event = state.event;

  return match(trip)
    .returnType<readonly Bubble[]>()
    .with({ status: "proposed" }, (proposed) => [
      ...revisionPreludeOf(event, proposed.revision),
      ...proposedHistory(
        state,
        proposed.plan,
        proposed.proposedAt,
        ageRejectionOf(proposed.plan, proposed.failedAgeCheck),
        diffOf(proposed.revision, proposed.plan),
      ),
    ])
    .with({ status: "approved" }, (approved) => [
      ...revisionPreludeOf(event, approved.revision),
      proposalOf(
        event,
        approved.plan,
        approved.proposedAt,
        badgesOf(approved.visibility),
        diffOf(approved.revision, approved.plan),
      ),
      ...approvalEchoOf(approved.plan, privateCountOf(approved.visibility)),
      ...ageVerifiedOf(approved.plan, approved.ageProof),
      afterApproval(approved.authorizations, approved.approvedAt),
    ])
    .with({ status: "paid" }, (paid) => paidHistory(event, paid))
    .with({ status: "written" }, (written) => [
      ...paidHistory(event, written),
      user({ kind: "writeBack" }),
      secretary(
        {
          kind: "written",
          writtenEventId: written.writtenEventId,
          confirmedStoreFailed: written.confirmedStoreError !== undefined,
        },
        written.writtenAt,
      ),
    ])
    .exhaustive();
};

const greetingOf = (
  event: ScanEvent,
  cap: MoneyResponse,
): readonly Bubble[] => {
  return [
    secretary({ kind: "greeting", title: event.title, cap }),
    secretary({ kind: "ask", title: event.title }),
  ];
};

// 休止状態のログは導入 (挨拶と問いかけ) から始め、trip があれば依頼の写しと提案から先の履歴を続ける
// trip があること自体がユーザの依頼の証なので、依頼の写しも trip の事実から導ける
// 導入を trip の有無で出し分けないので、最初の提案が届いてもログは途切れない
const idleOf = (state: ChatState): readonly Bubble[] => {
  const greeting = greetingOf(state.event, state.cap);

  if (state.trip === undefined) {
    return greeting;
  }

  return [
    ...greeting,
    user({ kind: "propose" }),
    ...historyOf(state, state.trip),
  ];
};

const canResume = (trip: TripResponse | undefined): boolean => {
  return trip?.status === "approved" && trip.authorizations.length > 0;
};

// 承認の 1 手は、計画が成人を要する候補を含むなら年齢の証明も伴う
const workingStepOf = (
  step: Step,
  trip: TripResponse | undefined,
): WorkingStep => {
  if (step !== "approve" || trip === undefined) {
    return step;
  }

  if (adultRequirementOfResponse(trip.plan) === undefined) {
    return step;
  }

  return "approveWithProof";
};

// 承認の写しは、計画が成人を要するなら証明の問いと同意の写しまでを含む
const approveEchoOf = (state: ChatState): readonly Bubble[] => {
  const privateCount = privateCountOf(chosenVisibility(state));

  if (state.trip === undefined) {
    return [approveEcho(privateCount)];
  }

  return approvalEchoOf(state.trip.plan, privateCount);
};

// 進行中の 1 手をユーザの吹き出しとして写す
const echoOf = (step: Step, state: ChatState): readonly Bubble[] => {
  return match(step)
    .returnType<readonly Bubble[]>()
    .with("propose", () => [user({ kind: "propose" })])
    .with("approve", () => approveEchoOf(state))
    .with("replan", () => [user({ kind: "replan" })])
    .with("pay", () => [user({ kind: "pay", resume: canResume(state.trip) })])
    .with("writeBack", () => [user({ kind: "writeBack" })])
    .exhaustive();
};

// 証明が通らなかった提案の返答は組み直しだけ (同じ計画は承認できない)、そうでなければ承認
const proposedReplies = (
  state: ChatState,
  trip: TripResponse,
  rejection: AgeRejection | undefined,
): readonly Reply[] => {
  if (rejection === undefined) {
    return [{ kind: "approve", trip, visibility: chosenVisibility(state) }];
  }

  return [{ kind: "replan", trip }];
};

const repliesOf = (state: ChatState): readonly Reply[] => {
  if (state.trip === undefined) {
    return [{ kind: "propose", eventId: state.event.id }];
  }

  // 自由入力の作り直しは Wave 1 では出さない (同じ計画が返るだけになる)
  return match(state.trip)
    .returnType<readonly Reply[]>()
    .with({ status: "proposed" }, (proposed) =>
      proposedReplies(
        state,
        proposed,
        ageRejectionOf(proposed.plan, proposed.failedAgeCheck),
      ),
    )
    .with({ status: "approved" }, (approved) => [
      { kind: "pay", trip: approved, resume: canResume(approved) },
    ])
    .with({ status: "paid" }, (paid) => [{ kind: "writeBack", trip: paid }])
    .with({ status: "written" }, () => [])
    .exhaustive();
};

// 証明を送るかの返事待ちは、承認の写しと証明の問いまでを出し、返答は送るかやめるかの 2 つ
// 提案済みで成人を要する計画でなければ (起こらないはず) 休止状態と同じ出力にする
const consentOf = (state: ChatState, idle: readonly Bubble[]): Conversation => {
  const trip = state.trip;

  if (trip?.status !== "proposed") {
    return { bubbles: idle, replies: repliesOf(state) };
  }

  const asked = askProofOf(trip.plan);

  if (asked.length === 0) {
    return { bubbles: idle, replies: repliesOf(state) };
  }

  const visibility = chosenVisibility(state);

  return {
    bubbles: [...idle, approveEcho(privateCountOf(visibility)), ...asked],
    replies: [
      { kind: "sendProof", trip, visibility },
      { kind: "declineProof" },
    ],
  };
};

/**
 * 状態から会話ログと返答を作る
 *
 * 毎回の描画で作り直し、保存しない
 * 進行中は休止列の後にユーザの写しと `working` を足して返答を空にし、失敗は `working` の代わりに `failed` を出して `dismiss` だけを返す
 * 証明を送るかの返事待ちはサーバを呼んでいないので、休止列の後に承認の写しと問いだけを足す
 */
export const conversationOf = (state: ChatState): Conversation => {
  const idle = idleOf(state);

  return match(state.activity)
    .returnType<Conversation>()
    .with({ kind: "busy" }, ({ step }) => ({
      bubbles: [
        ...idle,
        ...echoOf(step, state),
        secretary({
          kind: "working",
          step: workingStepOf(step, state.trip),
          title: state.event.title,
        }),
      ],
      replies: [],
    }))
    .with({ kind: "failed" }, ({ step, failure }) => ({
      bubbles: [
        ...idle,
        ...echoOf(step, state),
        secretary({ kind: "failed", failure }),
      ],
      replies: [{ kind: "dismiss" }],
    }))
    .with({ kind: "awaitingConsent" }, () => consentOf(state, idle))
    .with({ kind: "idle" }, () => ({
      bubbles: idle,
      replies: repliesOf(state),
    }))
    .exhaustive();
};
