import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSession } from "@/lib/require-session";

export default async function SettingsLayout({
  children,
}: LayoutProps<"/[locale]/settings">) {
  await requireSession();
  const t = await getTranslations("SettingsNav");

  // overflow は付けない。ページ全体をスクロールさせて、本文側の sticky を効かせる
  // (overflow-hidden な祖先があると、sticky はその動かない領域を基準にしてしまう)
  return (
    <div className="flex flex-1 bg-[#f5f6f8] text-slate-950">
      <aside className="hidden w-56 shrink-0 border-r border-[#e5e8ec] bg-white lg:block">
        {/* スクロールしてもナビは画面に残す */}
        <div className="sticky top-0 px-5 py-8">
          <h1 className="mb-6 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("title")}
          </h1>
          <nav aria-label={t("title")} className="space-y-1 text-sm">
            <span className="block rounded-lg px-3 py-2.5 text-slate-400">
              {t("profile")}
            </span>
            <Link
              href="/settings/services"
              aria-current="page"
              className="block rounded-lg bg-blue-50 px-3 py-2.5 font-semibold text-[#185fa5]"
            >
              {t("services")}
            </Link>
            <span className="block rounded-lg px-3 py-2.5 text-slate-400">
              {t("wallet")}
            </span>
          </nav>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
