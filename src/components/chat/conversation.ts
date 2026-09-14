import { match } from "ts-pattern";
import type { PaymentVisibilityInput } from "@/domain/trip";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type {
  AuthorizationResponse,
  MoneyResponse,
  PaymentVisibilityResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
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
 * 秘書の吹き出し 1 つ
 */
export type SecretaryLine =
  | { kind: "greeting"; title: string; cap: MoneyResponse }
  | { kind: "ask"; title: string }
  | {
      kind: "proposal";
      title: string;
      plan: TripPlanResponse;
      visibility?: PlanVisibility;
    }
  | { kind: "askPay" }
  | { kind: "partiallyPaid"; authorizations: readonly AuthorizationResponse[] }
  | { kind: "paid"; authorizations: readonly AuthorizationResponse[] }
  | { kind: "askWriteBack" }
  | { kind: "written"; writtenEventId: string }
  | { kind: "working"; step: Step; title: string }
  | { kind: "failed"; failure: RequestFailure };

/**
 * ユーザの吹き出し 1 つ (押した返答の写し)
 */
export type UserLine =
  | { kind: "propose" }
  | { kind: "approve"; privateCount: number }
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
 */
export type Reply =
  | { kind: "propose"; eventId: string }
  | { kind: "approve"; trip: TripResponse; visibility: PaymentVisibilityInput }
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
  return [visibility.outbound, visibility.inbound, visibility.lodging].filter(
    (chosen) => chosen === "private",
  ).length;
};

// 非公開を扱えない adapter では選択そのものが無いので、返答にも写しにも空を渡す
const chosenVisibility = (state: ChatState): PaymentVisibilityInput => {
  if (!state.capabilities.privateSettlement) {
    return {};
  }

  return state.visibility;
};

// 提案済みの計画は、adapter が非公開を扱えるときだけトグルを出す
// 進行中は返答ボタンと同じく操作を止める
const editorVisibilityOf = (state: ChatState): PlanVisibility | undefined => {
  if (!state.capabilities.privateSettlement) {
    return undefined;
  }

  return {
    mode: "editor",
    value: state.visibility,
    disabled: state.activity.kind === "busy",
  };
};

const badgesOf = (visibility: PaymentVisibilityResponse): PlanVisibility => {
  return { mode: "badges", value: visibility };
};

const proposalOf = (
  event: ScanEvent,
  plan: TripPlanResponse,
  proposedAt: string,
  visibility: PlanVisibility | undefined,
): Bubble => {
  return secretary(
    {
      kind: "proposal",
      title: event.title,
      plan,
      ...(visibility === undefined ? {} : { visibility }),
    },
    proposedAt,
  );
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

const paidHistory = (event: ScanEvent, trip: PaidFacts): readonly Bubble[] => {
  return [
    proposalOf(event, trip.plan, trip.proposedAt, badgesOf(trip.visibility)),
    user({ kind: "approve", privateCount: privateCountOf(trip.visibility) }),
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
      proposalOf(
        event,
        proposed.plan,
        proposed.proposedAt,
        editorVisibilityOf(state),
      ),
    ])
    .with({ status: "approved" }, (approved) => [
      proposalOf(
        event,
        approved.plan,
        approved.proposedAt,
        badgesOf(approved.visibility),
      ),
      user({
        kind: "approve",
        privateCount: privateCountOf(approved.visibility),
      }),
      afterApproval(approved.authorizations, approved.approvedAt),
    ])
    .with({ status: "paid" }, (paid) => paidHistory(event, paid))
    .with({ status: "written" }, (written) => [
      ...paidHistory(event, written),
      user({ kind: "writeBack" }),
      secretary(
        { kind: "written", writtenEventId: written.writtenEventId },
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

// 進行中の 1 手をユーザの吹き出しとして写す
const echoOf = (step: Step, state: ChatState): UserLine => {
  return match(step)
    .returnType<UserLine>()
    .with("propose", () => ({ kind: "propose" }))
    .with("approve", () => ({
      kind: "approve",
      privateCount: privateCountOf(chosenVisibility(state)),
    }))
    .with("pay", () => ({ kind: "pay", resume: canResume(state.trip) }))
    .with("writeBack", () => ({ kind: "writeBack" }))
    .exhaustive();
};

const repliesOf = (state: ChatState): readonly Reply[] => {
  if (state.trip === undefined) {
    return [{ kind: "propose", eventId: state.event.id }];
  }

  // 作り直しは Wave 1 では出さない (自由入力が無く、同じ計画が返るだけになる)
  return match(state.trip)
    .returnType<readonly Reply[]>()
    .with({ status: "proposed" }, (proposed) => [
      { kind: "approve", trip: proposed, visibility: chosenVisibility(state) },
    ])
    .with({ status: "approved" }, (approved) => [
      { kind: "pay", trip: approved, resume: canResume(approved) },
    ])
    .with({ status: "paid" }, (paid) => [{ kind: "writeBack", trip: paid }])
    .with({ status: "written" }, () => [])
    .exhaustive();
};

/**
 * 状態から会話ログと返答を作る
 *
 * 毎回の描画で作り直し、保存しない
 * 進行中は休止列の後にユーザの写しと `working` を足して返答を空にし、失敗は `working` の代わりに `failed` を出して `dismiss` だけを返す
 */
export const conversationOf = (state: ChatState): Conversation => {
  const idle = idleOf(state);

  return match(state.activity)
    .returnType<Conversation>()
    .with({ kind: "busy" }, ({ step }) => ({
      bubbles: [
        ...idle,
        user(echoOf(step, state)),
        secretary({ kind: "working", step, title: state.event.title }),
      ],
      replies: [],
    }))
    .with({ kind: "failed" }, ({ step, failure }) => ({
      bubbles: [
        ...idle,
        user(echoOf(step, state)),
        secretary({ kind: "failed", failure }),
      ],
      replies: [{ kind: "dismiss" }],
    }))
    .with({ kind: "idle" }, () => ({
      bubbles: idle,
      replies: repliesOf(state),
    }))
    .exhaustive();
};
