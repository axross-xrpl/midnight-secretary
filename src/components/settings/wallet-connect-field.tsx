"use client";

import { ErrorCodes } from "@midnight-ntwrk/dapp-connector-api";
import type { InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { useTranslations } from "next-intl";
import { useState } from "react";

// ネットワークは public な識別子 (bech32m の human-readable part を決めるだけ)
// なので NEXT_PUBLIC_ にして良い。未設定時は contract/.env の devnet 既定値と合わせる
const NETWORK_ID = process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? "undeployed";

type Status = "idle" | "connecting" | "error";

/**
 * ウォレット接続で埋める walletAddress 欄
 *
 * SCR-04c: 手入力を止め、window.midnight に注入された DApp Connector 経由で
 * ウォレット自身の unshielded アドレスを取得する。値を戻すだけで保存は呼び出し側
 * (フォームの Save ボタン) に任せる
 */
export function WalletConnectField({
  value,
  onChange,
}: {
  value: string;
  onChange: (address: string) => void;
}) {
  const t = useTranslations("ProfileSettings");
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<string | null>(null);

  const connect = async () => {
    setStatus("connecting");
    setFailure(null);

    const injected =
      typeof window === "undefined" ? {} : (window.midnight ?? {});
    const wallets = Object.values(injected) as InitialAPI[];

    if (wallets.length === 0) {
      setStatus("error");
      setFailure(t("wallet.notFound"));
      return;
    }

    try {
      // 複数ウォレットが入っている場合の選択 UI はまだ無いので、最初の1件につなぐ
      const connected = await wallets[0].connect(NETWORK_ID);
      const { unshieldedAddress } = await connected.getUnshieldedAddress();
      onChange(unshieldedAddress);
      setStatus("idle");
    } catch (caught) {
      setStatus("error");
      setFailure(failureMessage(caught, t));
    }
  };

  if (value !== "") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-[#e5e8ec] bg-slate-50 px-3 py-2">
          <span className="truncate font-mono text-sm text-slate-700">
            {value}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="ml-auto shrink-0 text-xs font-semibold text-[#185fa5] underline"
          >
            {t("wallet.disconnect")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void connect()}
        disabled={status === "connecting"}
        className="rounded-lg bg-[#185fa5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#144e88] disabled:opacity-60"
      >
        {status === "connecting" ? t("wallet.connecting") : t("wallet.connect")}
      </button>
      {failure !== null && <p className="text-xs text-red-700">{failure}</p>}
    </div>
  );
}

function failureMessage(
  caught: unknown,
  t: ReturnType<typeof useTranslations>,
): string {
  const code = (caught as { code?: string } | null)?.code;

  switch (code) {
    case ErrorCodes.Rejected:
    case ErrorCodes.PermissionRejected:
      return t("wallet.rejected");
    case ErrorCodes.Disconnected:
      return t("wallet.disconnected");
    default:
      return t("wallet.failed");
  }
}
