"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

type AuthStatusProps = {
  signInProvider: string;
};

export default function AuthStatus({ signInProvider }: AuthStatusProps) {
  const t = useTranslations("Auth");
  const { data: session, status } = useSession();
  // demo モードの dev サインインでは Google の文言を出さない
  const signInLabel =
    signInProvider === "google" ? t("signInWithGoogle") : t("signInAsDemoUser");

  if (status === "loading") {
    return null;
  }

  if (session) {
    return (
      <button
        type="button"
        onClick={() => signOut()}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <LogOut size={16} />
        {t("signOut")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn(signInProvider)}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-surface hover:opacity-90"
    >
      <LogIn size={16} />
      {signInLabel}
    </button>
  );
}
