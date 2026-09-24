"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import badge from "@/assets/zee-kwat-badge.png";
import { Link, usePathname } from "@/i18n/navigation";
import { PRODUCT_BRAND, PRODUCT_SUBTITLE } from "@/lib/product";
import LocaleSwitcher from "@/components/locale-switcher";
import AuthStatus from "@/components/auth-status";
import ContractServerStatus from "@/components/contract-server-status";

const links = [
  { href: "/", label: "home", protected: false },
  { href: "/tasks", label: "tasks", protected: true },
  { href: "/settings/profile", label: "settings", protected: true },
  // Add more links for navigation. Set `protected: true` to only
  // show the link once the user is signed in.
] as const;

type NavBarProps = {
  signInProvider: string;
  /** contract server の状態を出すか (mandate か identity が real のとき) */
  contractServerEnabled: boolean;
};

export default function NavBar({
  signInProvider,
  contractServerEnabled,
}: NavBarProps) {
  const t = useTranslations("NavBar");
  const { status } = useSession();
  const pathname = usePathname();

  // 未サインインのトップはヘッダーの無いヒーローなので、ナビごと出さない
  // loading では隠さない (layout から session を渡しているので初期状態で確定していて、loading になるのは再検証中だけ)
  if (status === "unauthenticated" && pathname === "/") {
    return undefined;
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-border px-6 py-4 sm:px-16">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        {/* 紺のバッジの右に名前を 2 段 (固有名詞を太く、Private Agent を小さく灰色で) */}
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src={badge}
            alt=""
            sizes="36px"
            className="size-9 object-contain"
          />
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-base font-medium">
              {PRODUCT_BRAND}
            </span>
            <span className="text-xs text-muted">{PRODUCT_SUBTITLE}</span>
          </span>
        </Link>
        <nav className="flex gap-6 text-base font-medium">
          {links
            .filter((link) => !link.protected || status === "authenticated")
            .map(({ href, label }) => (
              <Link key={href} href={href}>
                {t(label)}
              </Link>
            ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <ContractServerStatus enabled={contractServerEnabled} />
        <LocaleSwitcher />
        <AuthStatus signInProvider={signInProvider} />
      </div>
    </header>
  );
}
