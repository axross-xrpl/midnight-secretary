"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ContractServerHealth } from "@/lib/dev-contracts/network";

const POLL_INTERVAL_MS = 15_000;

type ContractServerStatusProps = {
  /** mandate か identity が real のときだけ true。両方 Fake なら contract server は要らないので出さない */
  enabled: boolean;
};

export default function ContractServerStatus({
  enabled,
}: ContractServerStatusProps) {
  const t = useTranslations("ContractServerStatus");
  const [health, setHealth] = useState<ContractServerHealth | null>(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/contract-server/health");
        const data = (await res.json()) as ContractServerHealth;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) {
          setHealth({ status: "unreachable", message: "request failed" });
        }
      }
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);

  if (!enabled) {
    return undefined;
  }

  const ready = health?.status === "ready";
  const label =
    health === null ? t("checking") : ready ? t("ready") : t("unreachable");
  const dotClass = health === null ? "bg-faint" : ready ? "bg-ok" : "bg-danger";

  return (
    <span
      title={health?.status === "unreachable" ? health.message : undefined}
      className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </span>
  );
}
