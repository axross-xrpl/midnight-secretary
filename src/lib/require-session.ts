import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { authOptions } from "@/auth";
import { redirect } from "@/i18n/navigation";

export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session) {
    const locale = await getLocale();
    redirect({ href: "/", locale });
    throw new Error("Unreachable: redirect() always throws");
  }

  return session;
}
