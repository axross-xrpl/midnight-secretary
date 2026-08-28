"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

export default function AuthSessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
