"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function AuthStatus() {
  const t = useTranslations("Auth");
  const { data: session, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (session) {
    return (
      <button
        type="button"
        onClick={() => signOut()}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-300 dark:hover:text-white"
      >
        <LogOut size={16} />
        {t("signOut")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn("google")}
      className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
    >
      <LogIn size={16} />
      {t("signInWithGoogle")}
    </button>
  );
}
