"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { Link, usePathname } from "@/i18n/navigation";

export default function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const activeLocale = useLocale();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="flex items-center gap-1.5 rounded-full border border-border bg-neutral-bg p-1 text-sm"
    >
      <Languages size={14} className="mx-1.5 text-muted" />
      {routing.locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            aria-current={isActive}
            className={
              isActive
                ? "whitespace-nowrap rounded-full bg-surface px-3 py-1 font-medium text-ink shadow-sm"
                : "whitespace-nowrap rounded-full px-3 py-1 text-muted hover:text-ink"
            }
          >
            {t(locale)}
          </Link>
        );
      })}
    </nav>
  );
}
