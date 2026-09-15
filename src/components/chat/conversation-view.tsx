"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useReducer, useRef } from "react";
import { match, P } from "ts-pattern";
import type { PaymentVisibilityInput } from "@/domain/trip";
import { Link, useRouter } from "@/i18n/navigation";
import type { ScanEvent, ScanEventTime } from "@/lib/calendar-scan-response";
import type { Result } from "@/lib/result";
import type {
  MandateResponse,
  MoneyResponse,
  TripResponse,
} from "@/lib/secretary-response";
import { BubbleItem } from "./bubble";
import type { Bubble, Reply } from "./conversation";
import { conversationOf } from "./conversation";
import { effectiveTrip, INITIAL_FLOW_STATE, reduceFlow } from "./flow";
import {
  adultRequirementOfResponse,
  DATE_OPTIONS,
  inclusiveEndDate,
  plainSpaces,
  TIMED_OPTIONS,
} from "./format";
import { LedgerPanel } from "./ledger-panel";
import { MandateCard } from "./mandate-card";
import { defaultMandateDraft } from "./mandate-defaults";
import type { VisibilityChangeHandler } from "./plan-details";
import {
  requestApproveTrip,
  requestPayForTrip,
  requestProposeTrip,
  requestSetUpMandate,
  requestWriteBackTrip,
} from "./request-secretary";
import { StepIndicator } from "./step-indicator";
import {
  backLinkClass,
  cardClass,
  ghostButtonClass,
  labelClass,
  primaryButtonClass,
  replyBarClass,
  sectionLabelClass,
  strongButtonClass,
} from "./styles";
import type {
  MandateCapabilities,
  PublicLedgerView,
  RequestFailure,
  Step,
} from "./types";

// 1 手を進める fetch (成功すれば次の状態の trip が返る)
type StepRequest = () => Promise<Result<TripResponse, RequestFailure>>;

type ReplyHandler = (reply: Reply) => void;

// 通貨は API の既定 (`secretary-request.ts`) と同じ MST
const DEFAULT_CURRENCY = "MST";

// 吹き出しの React の key (位置と話し手と行の種類)
// 作り直した提案では前の提案と新しい提案が並ぶので、位置を混ぜて一意にする
const bubbleKey = (bubble: Bubble, index: number): string => {
  return `${index}:${bubble.speaker}:${bubble.line.kind}`;
};

// 会話の末尾を表す印 (件数と最後の吹き出しの話し手と種類)
// 返答を押したときも秘書の返事が来たときも末尾が変わるので、これが変わったら末尾へスクロールする
const tailOf = (bubbles: readonly Bubble[]): string => {
  const last = bubbles.at(-1);

  if (last === undefined) {
    return "";
  }

  return `${bubbles.length}:${last.speaker}:${last.line.kind}`;
};

type EventWhenProps = {
  when: ScanEventTime;
};

const EventWhen = ({ when }: EventWhenProps): ReactElement => {
  const format = useFormatter();
  const text = plainSpaces(
    match(when)
      .with({ kind: "allDay" }, ({ startDate, endDate }) =>
        format.dateTimeRange(
          new Date(startDate),
          new Date(inclusiveEndDate(startDate, endDate)),
          DATE_OPTIONS,
        ),
      )
      .with({ kind: "timed" }, ({ start, end }) =>
        format.dateTimeRange(new Date(start), new Date(end), TIMED_OPTIONS),
      )
      .exhaustive(),
  );

  return <span>{text}</span>;
};

type ReplyButtonProps = {
  reply: Reply;
  disabled: boolean;
  onReply: ReplyHandler;
};

const ReplyButton = ({
  reply,
  disabled,
  onReply,
}: ReplyButtonProps): ReactElement => {
  const t = useTranslations("Conversation");
  const label = match(reply)
    .with({ kind: "propose" }, () => t("replies.propose"))
    .with({ kind: "approve" }, () => t("replies.approve"))
    .with({ kind: "sendProof" }, () => t("replies.sendProof"))
    .with({ kind: "declineProof" }, () => t("replies.declineProof"))
    .with({ kind: "pay", resume: true }, () => t("replies.resume"))
    .with({ kind: "pay", resume: false }, () => t("replies.pay"))
    .with({ kind: "writeBack" }, () => t("replies.writeBack"))
    .with({ kind: "dismiss" }, () => t("replies.dismiss"))
    .exhaustive();
  const className = match(reply)
    .with(
      { kind: P.union("approve", "sendProof", "pay") },
      () => strongButtonClass,
    )
    .with({ kind: P.union("declineProof", "dismiss") }, () => ghostButtonClass)
    .with({ kind: P.union("propose", "writeBack") }, () => primaryButtonClass)
    .exhaustive();

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => onReply(reply)}
    >
      {label}
    </button>
  );
};

type ConversationProps = {
  now: string;
  event: ScanEvent;
  mandate?: MandateResponse;
  trip?: TripResponse;
  publicLedger: PublicLedgerView;
  // 支払いの adapter が非公開を扱えるか (扱えないときは公開範囲のトグルを出さない)
  capabilities: MandateCapabilities;
  // 「予定一覧へ」の戻り先 (開いたときの一覧の表示)
  backHref: string;
};

/**
 * 予定 1 件について、秘書との会話ログの形で 提案 -> 承認 -> 支払い -> カレンダー登録 を進める
 *
 * 休止状態は props から導き、進行中の 1 手と直近の応答だけを手元に持つ
 * 変更が成功するたびに `router.refresh()` で props を追いつかせる
 */
export const Conversation = (props: ConversationProps): ReactElement => {
  const t = useTranslations("Conversation");
  const router = useRouter();
  const locale = useLocale();
  const [state, dispatch] = useReducer(reduceFlow, INITIAL_FLOW_STATE);
  // 作った直後は応答の値、refresh 後は props が勝つ (作成は 1 回きりなので古い方が勝ち続けない)
  const mandate = props.mandate ?? state.createdMandate;
  // 用途の文言は画面のロケールで決まるので、固定値の下書きはここで組む
  const mandateDraft = defaultMandateDraft(props.now, t("defaultPurpose"));
  const cap: MoneyResponse = mandate?.cap ?? {
    amount: mandateDraft.cap,
    currency: DEFAULT_CURRENCY,
  };
  const trip = effectiveTrip(props.trip, state.fresh);
  const conversation = conversationOf({
    event: props.event,
    cap,
    ...(trip === undefined ? {} : { trip }),
    activity: state.activity,
    capabilities: props.capabilities,
    visibility: state.visibility,
  });
  const busy = state.activity.kind === "busy";
  const tail = tailOf(conversation.bubbles);
  // DOM の ref は React の契約で初期値に null が要る
  const conversationRef = useRef<HTMLDivElement | null>(null);
  // DOM の ref は React の契約で初期値に null が要る
  const logRef = useRef<HTMLElement | null>(null);
  // 初回描画で末尾へ飛ばないよう、前回の描画の会話の末尾を覚えておく
  const shownTailRef = useRef(tail);

  // 会話の末尾が変わったとき (返答を押した、秘書の返事が来た) だけ、ログの末尾まで滑らかにスクロールする
  const followNewBubbles = (): void => {
    // 2 カラムではログの区画が、1 カラムでは .chat-layout がスクロールする
    // どちらが動くかは CSS のしきい値で決まるので両方に頼み、動かない方は何もしない
    // 効果の外に置くと Biome (useExhaustiveDependencies) が依存に挙げるよう求めるので、効果の中で定義する
    const scrollToLatest = (): void => {
      const log = logRef.current;
      const column = conversationRef.current;

      if (log === null || column === null) {
        return;
      }

      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
      column.scrollIntoView({ block: "end", behavior: "smooth" });
    };

    if (tail !== shownTailRef.current) {
      scrollToLatest();
    }

    shownTailRef.current = tail;
  };

  useEffect(followNewBubbles, [tail]);

  // dispatch と router を閉じ込めるのでコンポーネントの中で定義する
  const runStep = async (step: Step, request: StepRequest): Promise<void> => {
    dispatch({ type: "start", step });
    const result = await request();

    if (!result.ok) {
      dispatch({ type: "fail", failure: result.error });
      return;
    }

    dispatch({ type: "succeed", trip: result.value });
    router.refresh();
  };

  // 支払い枠が無ければ固定値で先に作り、それから提案する
  const proposeWithMandate = async (
    eventId: string,
  ): Promise<Result<TripResponse, RequestFailure>> => {
    if (mandate === undefined) {
      const created = await requestSetUpMandate(fetch, mandateDraft);

      if (!created.ok) {
        return created;
      }

      dispatch({ type: "mandateCreated", mandate: created.value });
    }

    return requestProposeTrip(fetch, { eventId, locale });
  };

  const propose = (eventId: string): Promise<void> => {
    return runStep("propose", () => proposeWithMandate(eventId));
  };

  const approve = (
    tripId: string,
    visibility: PaymentVisibilityInput,
  ): Promise<void> => {
    return runStep("approve", () =>
      requestApproveTrip(fetch, tripId, { visibility, locale }),
    );
  };

  // 年齢確認を求める候補があれば、証明を送ってよいかを先に聞く (サーバは呼ばない)
  const askOrApprove = async (
    target: TripResponse,
    visibility: PaymentVisibilityInput,
  ): Promise<void> => {
    if (adultRequirementOfResponse(target.plan) === undefined) {
      await approve(target.id, visibility);
      return;
    }

    dispatch({ type: "askConsent" });
  };

  const pay = (tripId: string): Promise<void> => {
    return runStep("pay", () => requestPayForTrip(fetch, tripId));
  };

  const writeBack = (tripId: string): Promise<void> => {
    return runStep("writeBack", () =>
      requestWriteBackTrip(fetch, tripId, { locale }),
    );
  };

  const onReply: ReplyHandler = (reply) => {
    match(reply)
      .with({ kind: "propose" }, ({ eventId }) => propose(eventId))
      .with({ kind: "approve" }, ({ trip: target, visibility }) =>
        askOrApprove(target, visibility),
      )
      .with({ kind: "sendProof" }, ({ trip: target, visibility }) =>
        approve(target.id, visibility),
      )
      .with({ kind: "declineProof" }, () =>
        dispatch({ type: "declineConsent" }),
      )
      .with({ kind: "pay" }, ({ trip: target }) => pay(target.id))
      .with({ kind: "writeBack" }, ({ trip: target }) => writeBack(target.id))
      .with({ kind: "dismiss" }, () => dispatch({ type: "dismiss" }))
      .exhaustive();
  };

  const onVisibilityChange: VisibilityChangeHandler = (category, value) => {
    dispatch({ type: "setVisibility", category, value });
  };

  // DOM は会話が先で、2 カラムのときだけ CSS がサイドバーを左に置く
  return (
    <div className="chat-layout">
      <div
        ref={conversationRef}
        className="chat-layout__conversation flex flex-col gap-5"
      >
        <header className="flex flex-col gap-3">
          <Link href={props.backHref} className={backLinkClass}>
            {`← ${t("back")}`}
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-[17px] font-bold">
              {t("title", { title: props.event.title })}
            </h1>
            <p className={labelClass}>
              <EventWhen when={props.event.when} />
              {props.event.location === undefined
                ? undefined
                : ` · ${props.event.location}`}
            </p>
          </div>
        </header>
        {/* ログの区画が列の余りを取り、2 カラムではこの中だけがスクロールする */}
        <section
          ref={logRef}
          className="chat-layout__log min-h-0 flex-1"
          aria-label={t("log")}
        >
          <ol className="flex flex-col gap-[18px]">
            {conversation.bubbles.map((bubble, index) => (
              <BubbleItem
                key={bubbleKey(bubble, index)}
                bubble={bubble}
                onVisibilityChange={onVisibilityChange}
              />
            ))}
          </ol>
        </section>
        {conversation.replies.length === 0 ? undefined : (
          <footer className={`chat-layout__replies ${replyBarClass}`}>
            {conversation.replies.map((reply) => (
              <ReplyButton
                key={reply.kind}
                reply={reply}
                disabled={busy}
                onReply={onReply}
              />
            ))}
          </footer>
        )}
      </div>
      <aside className="chat-layout__sidebar flex flex-col gap-5">
        <section className={`${cardClass} flex flex-col gap-3`}>
          <h2 className={sectionLabelClass}>{t("progress")}</h2>
          <StepIndicator activity={state.activity} trip={trip} />
        </section>
        {mandate === undefined ? (
          <p className={`${cardClass} text-[12.5px] text-muted`}>
            {t("noMandate")}
          </p>
        ) : (
          <MandateCard mandate={mandate} />
        )}
        <LedgerPanel publicLedger={props.publicLedger} mandate={mandate} />
      </aside>
    </div>
  );
};
