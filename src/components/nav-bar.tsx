"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import LocaleSwitcher from "@/components/locale-switcher";
import AuthStatus from "@/components/auth-status";

const links = [
  { href: "/", label: "home", protected: false },
  { href: "/dashboard", label: "dashboard", protected: true },
  { href: "/tasks", label: "tasks", protected: true },
  { href: "/settings/services", label: "settings", protected: true },
  // Add more links for navigation. Set `protected: true` to only
  // show the link once the user is signed in.
] as const;

export default function NavBar() {
  const t = useTranslations("NavBar");
  const { status } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-black/8 px-16 py-4 dark:border-white/[.145]">
      <nav className="flex gap-6 text-sm font-medium">
        {links
          .filter((link) => !link.protected || status === "authenticated")
          .map(({ href, label }) => (
            <Link key={href} href={href}>
              {t(label)}
            </Link>
          ))}
      </nav>
      <div className="flex items-center gap-4">
        <LocaleSwitcher />
        <AuthStatus />
      </div>
    </header>
  );
}
