"use client";

import { useState } from "react";
import { LoaderCircle, Send, Sparkles } from "lucide-react";

type ServiceKind = "hotel" | "restaurant" | "leisure";

type Candidate = {
  id: string;
  kind: ServiceKind;
  name: string;
  itemName?: string;
  priceJpy: number;
  nearestStation: string;
  stationAccessMin: number;
  genre?: string;
  rating?: number;
  openFrom?: string;
  openTo?: string;
  requiredVerifications: string[];
  ageLimit?: number;
};

type ProposalGroup = {
  kind: ServiceKind;
  picks: Array<{ id: string; reason: string }>;
  candidates: Candidate[];
};

type ProposalResponse = {
  message?: string;
  fallback?: boolean;
  groups?: ProposalGroup[];
};

// 表示の順番と見出しはここで決める
const KIND_LABELS: Record<ServiceKind, { title: string; hint: string }> = {
  hotel: { title: "宿泊", hint: "1泊あたり" },
  restaurant: { title: "飲食店", hint: "1人あたり" },
  leisure: { title: "レジャー", hint: "1枚あたり" },
};

const VERIFICATION_LABELS: Record<string, string> = {
  age: "年齢確認",
  nationality: "国籍確認",
  residence: "居住地確認",
};

function verificationText(candidate: Candidate): string {
  return candidate.requiredVerifications
    .map((kind) =>
      kind === "age" && candidate.ageLimit !== undefined
        ? `${candidate.ageLimit}歳以上`
        : (VERIFICATION_LABELS[kind] ?? kind),
    )
    .join(" / ");
}

type BookingQuote = {
  hotelId: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  totalPriceJpy: number;
  currency: "JPY";
  status: "quoted";
};

const initialRequest = "大阪駅に近くて、仕事で使いやすいホテルを探しています";

export default function Home() {
  const [request, setRequest] = useState(initialRequest);
  const [maxPrice, setMaxPrice] = useState("20000");
  const [result, setResult] = useState<ProposalResponse | null>(null);
  const [rawResponse, setRawResponse] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [checkIn, setCheckIn] = useState("2026-09-20");
  const [checkOut, setCheckOut] = useState("2026-09-21");
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  async function submitProposal(event: React.FormEvent<HTMLFormElement>) {
    // 新しい検索を始める前に、前回の検索結果と予約状態をリセットする。
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setResult(null);
    setRawResponse("");
    setSelectedHotelId("");
    setQuote(null);
    setPaymentError("");

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "hotel",
          request,
          filters: { city: "大阪", maxPrice: Number(maxPrice) || undefined },
        }),
      });
      const text = await response.text();
      setRawResponse(text);

      let parsed: ProposalResponse;
      try {
        parsed = JSON.parse(text) as ProposalResponse;
      } catch {
        throw new Error(
          `JSONとして読み取れないレスポンスです（HTTP ${response.status}）`,
        );
      }

      if (!response.ok) {
        throw new Error(
          parsed.message ??
            `リクエストに失敗しました（HTTP ${response.status}）`,
        );
      }
      setResult(parsed);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "予期しないエラーが発生しました",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function requestQuote() {
    // 選択したホテルと宿泊日をもとに、サーバーで見積を再計算する。
    if (!selectedHotelId) {
      setError("先にホテルを選択してください");
      return;
    }

    setIsQuoting(true);
    setError("");
    setQuote(null);

    try {
      const response = await fetch("/api/bookings/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: selectedHotelId, checkIn, checkOut }),
      });
      const body = (await response.json()) as {
        quote?: BookingQuote;
        error?: string;
      };

      if (!response.ok || !body.quote) {
        throw new Error(
          body.error ?? `予約確認に失敗しました（HTTP ${response.status}）`,
        );
      }

      setQuote(body.quote);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "予約確認に失敗しました",
      );
    } finally {
      setIsQuoting(false);
    }
  }

  async function payBooking() {
    // 検証済みのホテルIDと宿泊日だけを決済APIへ送信する。
    if (!quote) return;

    setIsPaying(true);
    setPaymentError("");

    try {
      const response = await fetch("/api/bookings/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: quote.hotelId,
          checkIn: quote.checkIn,
          checkOut: quote.checkOut,
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        code?: string;
      };

      if (!response.ok) {
        throw new Error(
          `${body.code ?? "PAYMENT_FAILED"}: ${body.message ?? "決済に失敗しました"}`,
        );
      }
    } catch (caughtError) {
      setPaymentError(
        caughtError instanceof Error
          ? caughtError.message
          : "決済に失敗しました",
      );
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <div className="min-h-full bg-[#f3f0e9] text-[#17211d]">
      <div className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:px-10">
        <section className="flex flex-col justify-center">
          <div className="mb-8 flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#557264]">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#d5e1d8]">
              <Sparkles className="size-4" />
            </span>
            AI提案ラボ
          </div>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-[#1d3029] sm:text-6xl">
            ホテル探しを、
            <span className="block text-[#b85c38]">会話から始める。</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-[#5d6b64]">
            条件をひとつ入力して、現在の Gemini 連携と API
            の返却内容を確認できます。この画面は動作確認用の簡易コンソールです。
          </p>

          <form
            onSubmit={submitProposal}
            className="mt-10 space-y-5 rounded-2xl border border-[#d7d2c7] bg-[#fbfaf6] p-5 shadow-[0_18px_50px_rgba(45,54,44,0.08)] sm:p-7"
          >
            <label className="block">
              <span className="text-sm font-semibold text-[#34453d]">
                希望条件
              </span>
              <textarea
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                rows={4}
                maxLength={1000}
                className="mt-2 w-full resize-y rounded-xl border border-[#d8d5cc] bg-white px-4 py-3 leading-7 outline-none transition focus:border-[#b85c38] focus:ring-2 focus:ring-[#b85c38]/15"
                required
              />
            </label>
            <label className="block max-w-xs">
              <span className="text-sm font-semibold text-[#34453d]">
                1泊の上限価格（円）
              </span>
              <input
                type="number"
                min="0"
                step="1000"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#d8d5cc] bg-white px-4 py-3 outline-none transition focus:border-[#b85c38] focus:ring-2 focus:ring-[#b85c38]/15"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d3029] px-5 font-semibold text-white transition hover:bg-[#29473b] disabled:cursor-wait disabled:opacity-60"
            >
              {isLoading ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Send className="size-5" />
              )}
              {isLoading ? "問い合わせ中..." : "AIに提案を依頼"}
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-5 lg:py-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b85c38]">
                返却モニター
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[#1d3029]">
                返却内容
              </h2>
            </div>
            {result?.fallback && (
              <span className="rounded-full bg-[#f2d5c7] px-3 py-1 text-xs font-semibold text-[#8b4028]">
                フォールバック
              </span>
            )}
          </div>
          {error && (
            <div className="rounded-xl border border-[#d99a82] bg-[#fff0e9] p-4 text-sm leading-6 text-[#8b4028]">
              {error}
            </div>
          )}
          <div className="min-h-64 rounded-2xl border border-[#d7d2c7] bg-[#fbfaf6] p-6 shadow-[0_18px_50px_rgba(45,54,44,0.06)]">
            {!result && !error && !isLoading && (
              <div className="flex h-52 items-center justify-center text-center text-sm leading-7 text-[#758078]">
                左のフォームから送信すると、
                <br />
                API の返却結果がここに表示されます。
              </div>
            )}
            {isLoading && (
              <div className="flex h-52 items-center justify-center gap-3 text-[#557264]">
                <LoaderCircle className="size-5 animate-spin" /> Gemini
                に問い合わせています
              </div>
            )}
            {result && (
              <div className="space-y-7">
                <p className="text-lg leading-8 text-[#34453d]">
                  {result.message}
                </p>
                {result.groups?.map((group) => {
                  const label = KIND_LABELS[group.kind];

                  return (
                    <section key={group.kind} className="space-y-3">
                      <div className="flex items-baseline justify-between gap-3 border-b border-[#ddd8cc] pb-2">
                        <h3 className="text-sm font-semibold tracking-[0.08em] text-[#1d3029]">
                          {label.title}
                        </h3>
                        <span className="text-xs text-[#7b857f]">
                          提案 {group.picks.length} / 候補{" "}
                          {group.candidates.length}件
                        </span>
                      </div>
                      {group.picks.length === 0 ? (
                        <p className="text-sm leading-6 text-[#758078]">
                          条件に合う{label.title}の提案はありませんでした。
                        </p>
                      ) : (
                        <div className="grid gap-3">
                          {group.picks.map((pick) => {
                            const candidate = group.candidates.find(
                              (item) => item.id === pick.id,
                            );
                            const verifications =
                              candidate === undefined
                                ? ""
                                : verificationText(candidate);

                            return (
                              <article
                                key={pick.id}
                                className={`rounded-xl border bg-white p-4 ${group.kind === "hotel" && selectedHotelId === pick.id ? "border-[#b85c38] ring-2 ring-[#b85c38]/15" : "border-[#dedbd2]"}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="font-semibold">
                                      {candidate?.name ?? pick.id}
                                    </div>
                                    {candidate?.itemName && (
                                      <div className="mt-0.5 text-xs text-[#7b857f]">
                                        {candidate.itemName}
                                      </div>
                                    )}
                                    <p className="mt-2 text-sm leading-6 text-[#65736b]">
                                      {pick.reason}
                                    </p>
                                    {candidate && (
                                      <div className="mt-3 text-xs text-[#557264]">
                                        ¥{candidate.priceJpy.toLocaleString()}
                                        <span className="text-[#7b857f]">
                                          {" "}
                                          / {label.hint}
                                        </span>{" "}
                                        / {candidate.nearestStation} 徒歩
                                        {candidate.stationAccessMin}分
                                        {candidate.genre
                                          ? ` / ${candidate.genre}`
                                          : ""}
                                        {candidate.rating !== undefined
                                          ? ` / 評価 ${candidate.rating}`
                                          : ""}
                                        {candidate.openFrom && candidate.openTo
                                          ? ` / ${candidate.openFrom}–${candidate.openTo}`
                                          : ""}
                                      </div>
                                    )}
                                    {verifications !== "" && (
                                      <div className="mt-2 inline-block rounded-full bg-[#f6e9d8] px-2.5 py-1 text-xs font-medium text-[#8b5a28]">
                                        要 {verifications}
                                      </div>
                                    )}
                                  </div>
                                  {group.kind === "hotel" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedHotelId(pick.id)
                                      }
                                      className="shrink-0 rounded-lg border border-[#b85c38] px-3 py-2 text-xs font-semibold text-[#8b4028] hover:bg-[#fff0e9]"
                                    >
                                      選択
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
          {result && selectedHotelId && (
            <div className="rounded-2xl border border-[#d7d2c7] bg-[#fbfaf6] p-6">
              <h3 className="font-semibold text-[#1d3029]">予約内容を確認</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[#34453d]">
                  チェックイン
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(event) => setCheckIn(event.target.value)}
                    className="mt-2 block w-full rounded-xl border border-[#d8d5cc] bg-white px-3 py-2 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-[#34453d]">
                  チェックアウト
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(event) => setCheckOut(event.target.value)}
                    className="mt-2 block w-full rounded-xl border border-[#d8d5cc] bg-white px-3 py-2 font-normal"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={requestQuote}
                disabled={isQuoting}
                className="mt-5 w-full rounded-xl bg-[#b85c38] px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {isQuoting ? "料金を確認中..." : "料金と予約内容を確認"}
              </button>
              {quote && (
                <div className="mt-5 rounded-xl border border-[#d7d2c7] bg-white p-4">
                  <p className="font-semibold">{quote.hotelName}</p>
                  <p className="mt-2 text-sm text-[#65736b]">
                    {quote.checkIn} 〜 {quote.checkOut}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-[#1d3029]">
                    ¥{quote.totalPriceJpy.toLocaleString()}
                  </p>
                  <button
                    type="button"
                    onClick={payBooking}
                    disabled={isPaying}
                    className="mt-4 w-full rounded-xl bg-[#1d3029] px-4 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {isPaying ? "決済処理中..." : "この内容で決済する"}
                  </button>
                  {paymentError && (
                    <div className="mt-4 rounded-lg border border-[#d99a82] bg-[#fff0e9] p-3 text-sm leading-6 text-[#8b4028]">
                      {paymentError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <details className="rounded-2xl border border-[#d7d2c7] bg-[#26352e] text-[#e6eee8]">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">
              Raw JSON response
            </summary>
            <pre className="max-h-80 overflow-auto border-t border-white/10 px-5 py-4 text-xs leading-6 whitespace-pre-wrap">
              {rawResponse || "送信後に表示されます"}
            </pre>
          </details>
        </section>
      </div>
    </div>
  );
}
