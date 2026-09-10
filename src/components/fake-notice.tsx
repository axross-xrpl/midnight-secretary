import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import type { PortName } from "@/application/sources";

type FakeNoticeProps = {
  fakes: readonly PortName[];
};

/**
 * 全ページの先頭に出す 1 行で、fake が担っている port を挙げる
 *
 * 全 port が real なら何も描画しない
 */
export const FakeNotice = async ({
  fakes,
}: FakeNoticeProps): Promise<ReactElement | undefined> => {
  if (fakes.length === 0) {
    return undefined;
  }

  const t = await getTranslations("FakeNotice");
  const format = await getFormatter();
  const ports = format.list(
    fakes.map((port) => t(`ports.${port}`)),
    { type: "conjunction" },
  );

  return (
    <p
      role="status"
      className="border-b border-amber-300/60 bg-amber-50 px-16 py-2 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-200"
    >
      {t("message", { ports })}
    </p>
  );
};
