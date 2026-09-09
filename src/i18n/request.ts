import type { AbstractIntlMessages } from "next-intl";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";

import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { completeWithEnglish } from "./messages";
import { routing } from "./routing";

type Locale = (typeof routing.locales)[number];

// 英語が土台で、すべてのキーは en.json に存在しなければならない (AppConfig 経由で tsc が強制する)
// 日本語は en.json に無いキーを英語の文言で補完した形で持ち、モジュール読み込み時に 1 回だけ組み立てる
const messagesByLocale = {
  en,
  ja: completeWithEnglish(ja, en),
} satisfies Record<Locale, AbstractIntlMessages>;

export default getRequestConfig(async () => {
  const requested = await rootParams.locale();

  if (!hasLocale(routing.locales, requested)) {
    notFound();
  }

  return {
    locale: requested,
    // 日時の表示に使うタイムゾーンを固定し、サーバとブラウザで同じ文字列にする
    timeZone: "Asia/Tokyo",
    messages: messagesByLocale[requested],
  };
});
