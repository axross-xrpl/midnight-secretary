"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/** リンクにできる設定ページ。ウォレット (SCR-04c) は未実装なので非活性のまま */
const pages = [
  { href: "/settings/profile", label: "profile" },
  { href: "/settings/services", label: "services" },
] as const;

/**
 * 設定ナビ
 *
 * 現在ページの判定に URL が要るのでクライアント側に置く
 * `usePathname` はロケールを除いたパスを返すので、`href` とそのまま比べられる
 */
export function SettingsNav() {
  const t = useTranslations("SettingsNav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("title")} className="space-y-1 text-sm">
      {pages.map(({ href, label }) => {
        const isCurrent = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={`block rounded-lg px-3 py-2.5 transition ${
              isCurrent
                ? "bg-blue-50 font-semibold text-[#185fa5]"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t(label)}
          </Link>
        );
      })}
      <span className="block rounded-lg px-3 py-2.5 text-slate-400">
        {t("wallet")}
      </span>
    </nav>
  );
}
