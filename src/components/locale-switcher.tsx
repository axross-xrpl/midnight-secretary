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
      className="flex items-center gap-1.5 rounded-full border border-black/8 bg-zinc-50 p-1 text-sm dark:border-white/[.145] dark:bg-zinc-900"
    >
      <Languages
        size={14}
        className="mx-1.5 text-zinc-500 dark:text-zinc-400"
      />
      {routing.locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            aria-current={isActive}
            className={
              "flex w-16 items-center justify-center rounded-full py-1 text-center font-medium " +
              (isActive
                ? "bg-white text-black shadow-sm dark:bg-black dark:text-white"
                : "text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white")
            }
          >
            {t(locale)}
          </Link>
        );
      })}
    </nav>
  );
}
