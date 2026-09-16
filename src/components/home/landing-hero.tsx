import Image from "next/image";
import type { ReactElement } from "react";
import mark from "@/assets/zee-kwat-mark.png";
import { LandingCalendar } from "@/components/home/landing-calendar";
import { LandingSignIn } from "@/components/home/landing-sign-in";

type Props = {
  /** next-auth の provider id (layout.tsx と同じ導き方で page.tsx が渡す) */
  signInProvider: string;
};

/**
 * 未サインインのトップ (ヘッダーなしのヒーロー)
 *
 * 文言は英語のみで、ライトテーマ固定 (ユーザ決定、024)
 * 見た目の数値は globals.css の .landing-hero* にある
 */
export const LandingHero = ({ signInProvider }: Props): ReactElement => {
  return (
    <section className="landing-hero">
      <LandingCalendar />
      <div className="landing-hero__veil" />
      <div className="landing-hero__copy">
        <div className="landing-hero__rise">
          {/* この画面の LCP なので先に読ませる (Next 16 では priority ではなく preload) */}
          <Image
            src={mark}
            alt="Zee-Kwat owl mark"
            className="landing-hero__mark"
            preload
          />
          <h1 className="landing-hero__name">
            Zee-<span className="landing-hero__name-accent">Kwat</span>
          </h1>
        </div>
        <p className="landing-hero__sub">Private Agent</p>
        <p className="landing-hero__tag">
          Put the trip on your calendar. The owl books it, pays for it, and
          proves only what&rsquo;s needed &mdash; on Midnight.
        </p>
      </div>
      <LandingSignIn signInProvider={signInProvider} />
    </section>
  );
};
