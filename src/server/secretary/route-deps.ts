import "server-only";

import { createTranslator } from "next-intl";
import { secretaryContextFor } from "@/adapters/auth/session";
import type { Locale } from "@/domain/locale";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import type { LoadWriteBackTranslate, SecretaryHandlerDeps } from "./handlers";

// この名前空間だけを厳密な型で持つ
// AbstractIntlMessages のような添字型を渡すと next-intl がキーを解決できず、どの文言も引けなくなる
type WriteBackMessages = { WriteBack: typeof en.WriteBack };

// Route Handler は [locale] の外にあってリクエストごとの i18n の文脈を持たないので、messages をここで組み立てて翻訳関数を作る
// 英語が土台で、日本語に無いキーは英語の文言に落とす (src/i18n/request.ts の補完と同じ)
const WRITE_BACK_MESSAGES: Record<Locale, WriteBackMessages> = {
  en: { WriteBack: en.WriteBack },
  ja: {
    WriteBack: {
      ...en.WriteBack,
      ...ja.WriteBack,
      mode: { ...en.WriteBack.mode, ...ja.WriteBack.mode },
    },
  },
};

const loadTranslate: LoadWriteBackTranslate = async (locale) => {
  return createTranslator({
    locale,
    messages: WRITE_BACK_MESSAGES[locale],
    namespace: "WriteBack",
  });
};

/**
 * Route Handler が渡す本番の deps
 *
 * `resolveContext` はリクエストのセッションからユーザと deps を解決する
 * `loadTranslate` は `WriteBack` 名前空間の翻訳関数を返す
 */
export const secretaryRouteDeps: SecretaryHandlerDeps = {
  resolveContext: (request) => secretaryContextFor(request, Date.now()),
  loadTranslate,
};
