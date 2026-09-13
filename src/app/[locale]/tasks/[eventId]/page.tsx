import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";
import { match, P } from "ts-pattern";
import { secretaryContext } from "@/adapters/auth/session";
import { Conversation } from "@/components/chat/conversation-view";
import { FailureNotice } from "@/components/chat/failure-notice";
import { backLinkClass, emptyStateClass } from "@/components/chat/styles";
import { parseCalendarEventId } from "@/domain/identifiers.parse";
import { Link, redirect } from "@/i18n/navigation";
import type { ChatLoadError } from "@/server/secretary/chat-page";
import { loadChatData } from "@/server/secretary/chat-page";
import { serializableSecretaryError } from "@/server/secretary/responses";

type ChatShellProps = {
  children: ReactNode;
};

// 会話画面の枠で、サイドバーと会話の 2 カラムは Conversation の .chat-layout (globals.css) が組む
// 枠は main から受け取った残りの高さに固定し (min-h-0)、スクロールは .chat-layout とその中の区画が受け持つ
const ChatShell = ({ children }: ChatShellProps): ReactElement => {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg text-ink">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
        {children}
      </div>
    </div>
  );
};

type LoadFailureProps = {
  error: ChatLoadError;
  noEvent: string;
};

// 予定が窓に無いのは案内、それ以外は use case の失敗として文言化する
const LoadFailure = ({ error, noEvent }: LoadFailureProps): ReactElement => {
  return match(error)
    .with({ kind: "eventNotFound" }, () => (
      <p className={emptyStateClass}>{noEvent}</p>
    ))
    .with({ source: P.string }, (secretaryError) => (
      <FailureNotice
        failure={{
          code: "secretary",
          error: serializableSecretaryError(secretaryError),
        }}
      />
    ))
    .exhaustive();
};

type ChatPageProps = {
  params: Promise<{ eventId: string }>;
};

/**
 * 予定 1 件の会話画面 (提案 -> 承認 -> 支払い -> カレンダー登録)
 *
 * 読み取りはこの Server Component が use case を直接呼び、変更はクライアントが Route Handler を叩く
 */
const ChatPage = async ({ params }: ChatPageProps): Promise<ReactElement> => {
  const context = await secretaryContext();

  if (!context.ok) {
    return redirect({ href: "/", locale: await getLocale() });
  }

  const { eventId } = await params;
  const parsedEventId = parseCalendarEventId(eventId);

  if (!parsedEventId.ok) {
    notFound();
  }

  const t = await getTranslations("Conversation");
  const data = await loadChatData(context.value, parsedEventId.value);

  if (!data.ok) {
    return (
      <ChatShell>
        <div className="flex flex-col gap-5 p-[22px] px-[26px] pb-[26px]">
          <Link href="/tasks" className={backLinkClass}>
            {`← ${t("back")}`}
          </Link>
          <LoadFailure error={data.error} noEvent={t("noEvent")} />
        </div>
      </ChatShell>
    );
  }

  return (
    <ChatShell>
      <Conversation
        now={data.value.now}
        event={data.value.event}
        mandate={data.value.mandate}
        trip={data.value.trip}
        publicLedger={data.value.publicLedger}
      />
    </ChatShell>
  );
};

export default ChatPage;
