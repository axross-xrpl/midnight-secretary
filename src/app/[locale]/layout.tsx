import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Noto_Sans_JP,
  Noto_Serif_JP,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { locale } from "next/root-params";
import { getServerSession } from "next-auth";
import { DEV_PROVIDER_ID } from "@/adapters/auth/dev";
import { getSecretaryRuntime } from "@/adapters/runtime";
import { activeFakes } from "@/application/sources";
import { authOptions } from "@/auth";
import { routing } from "@/i18n/routing";
import { PRODUCT_NAME } from "@/lib/product";
import { FakeNotice } from "@/components/fake-notice";
import NavBar from "@/components/nav-bar";
import AuthSessionProvider from "@/components/session-provider";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Geist に和文グリフが無いので、本文の和文はこちらに落ちる (globals.css の --font-sans)
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
});

// 見出しとブランド名だけ明朝 (globals.css の --font-serif)
const notoSerifJp = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  subsets: ["latin"],
});

/**
 * タブと共有の題名
 *
 * 名前は訳さないので messages には置かず、説明だけをロケールから取る
 */
export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("App");

  return {
    title: PRODUCT_NAME,
    description: t("description"),
  };
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
}: LayoutProps<"/[locale]">) {
  const session = await getServerSession(authOptions);
  const { sources } = getSecretaryRuntime();
  const signInProvider = sources.auth === "dev" ? DEV_PROVIDER_ID : "google";

  return (
    <html
      lang={await locale()}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansJp.variable} ${notoSerifJp.variable} h-full antialiased`}
    >
      {/* 画面の高さに固定し、会話画面が nav の下の残りの高さの中でスクロールできるようにする */}
      {/* 他のページは中身が溢れれば今までどおりページ全体がスクロールする */}
      <body className="flex h-full flex-col">
        <NextIntlClientProvider>
          <AuthSessionProvider session={session}>
            <NavBar
              signInProvider={signInProvider}
              contractServerEnabled={
                sources.mandate === "real" || sources.identity === "real"
              }
            />
            <FakeNotice fakes={activeFakes(sources)} />
            {/* ページの根 (main の直下) は残りの高さより縮まない (中身が長ければ main から溢れてページ全体がスクロールする) */}
            {/* 会話画面の枠は flex-1 (basis 0) で残りの高さまで育つだけなので影響しない */}
            <main className="flex min-h-0 flex-1 flex-col *:shrink-0">
              {children}
            </main>
          </AuthSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
