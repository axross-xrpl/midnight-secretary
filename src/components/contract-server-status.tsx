"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ContractServerHealth } from "@/lib/dev-contracts/network";

const POLL_INTERVAL_MS = 15_000;

export default function ContractServerStatus() {
  const t = useTranslations("ContractServerStatus");
  const [health, setHealth] = useState<ContractServerHealth | null>(null);

  useEffect(() => {
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
  }, []);

  const ready = health?.status === "ready";
  const label =
    health === null ? t("checking") : ready ? t("ready") : t("unreachable");
  const dotClass =
    health === null ? "bg-zinc-400" : ready ? "bg-green-500" : "bg-red-500";

  return (
    <span
      title={health?.status === "unreachable" ? health.message : undefined}
      className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </span>
  );
}
