import type en from "../../messages/en.json";
import type { routing } from "./routing";

declare module "next-intl" {
  interface AppConfig {
    /**
     * ルーターが受け付けるロケール
     *
     * `useLocale()` と `Link` の型がこれに絞られる
     */
    Locale: (typeof routing.locales)[number];

    /**
     * 英語が必須の土台
     *
     * メッセージキーはコンパイル時に en.json と照合される
     * 他のロケールは opt-in の overlay で、英語にフォールバックする (request.ts を参照)
     */
    Messages: typeof en;
  }
}
