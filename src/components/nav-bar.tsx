"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { PRODUCT_NAME } from "@/lib/product";
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
};

export default function NavBar({ signInProvider }: NavBarProps) {
  const t = useTranslations("NavBar");
  const { status } = useSession();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-black/8 px-16 py-4 dark:border-white/[.145]">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <Link href="/" className="text-base font-semibold tracking-tight">
          {PRODUCT_NAME}
        </Link>
        <nav className="flex gap-6 text-sm font-medium">
          {links
            .filter((link) => !link.protected || status === "authenticated")
            .map(({ href, label }) => (
              <Link key={href} href={href}>
                {t(label)}
              </Link>
            ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <ContractServerStatus />
        <LocaleSwitcher />
        <AuthStatus signInProvider={signInProvider} />
      </div>
    </header>
  );
}
