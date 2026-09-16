"use client";

import { LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import type { ReactElement } from "react";

type Props = {
  signInProvider: string;
};

/**
 * ヒーローのサインインボタン (auth-status.tsx と同じ signIn を呼ぶ)
 *
 * 文言は英語固定 (024)
 */
export const LandingSignIn = ({ signInProvider }: Props): ReactElement => {
  // demo モードの dev サインインでは Google の文言を出さない
  const withGoogle = signInProvider === "google";

  return (
    <>
      <button
        type="button"
        onClick={() => signIn(signInProvider)}
        className="landing-hero__signin"
      >
        <LogIn aria-hidden />
        {withGoogle ? "Sign in with Google" : "Sign in as demo user"}
      </button>
      <p className="landing-hero__hint">
        {withGoogle
          ? "Asks for read access to Google Calendar"
          : "Demo mode: no Google account needed"}
      </p>
    </>
  );
};
