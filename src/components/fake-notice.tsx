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
      className="border-b border-border bg-warn-bg px-6 py-2 text-sm text-warn sm:px-16"
    >
      {t("message", { ports })}
    </p>
  );
};
