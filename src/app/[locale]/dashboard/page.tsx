import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/require-session";

export default async function DashboardPage() {
  const session = await requireSession();
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 dark:bg-black">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        {t("welcome", { name: session.user?.name ?? "" })}
      </p>
    </div>
  );
}
