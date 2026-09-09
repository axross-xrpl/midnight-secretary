import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import {
  isAccessTokenExpired,
  refreshGoogleAccessToken,
} from "@/lib/google-token";

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events",
        },
      },
    }),
  ],
  callbacks: {
    // トークンは JWT (cookie) だけに置き、session には出さない
    // 期限切れならセッションを読むたびにここで更新して cookie に書き戻す
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      if (
        !isAccessTokenExpired(token.expiresAt, Date.now()) ||
        token.refreshToken === undefined
      ) {
        return token;
      }

      const refreshed = await refreshGoogleAccessToken(
        token.refreshToken,
        {
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        },
        { fetch, nowMs: Date.now() },
      );

      // 更新に失敗しても期限切れのまま残し、Route Handler 側で失敗として返す
      if (!refreshed.ok) {
        return token;
      }

      return {
        ...token,
        accessToken: refreshed.value.accessToken,
        expiresAt: refreshed.value.expiresAt,
        refreshToken: refreshed.value.refreshToken ?? token.refreshToken,
      };
    },
  },
};
