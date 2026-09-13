import type { DefaultSession, NextAuthOptions } from "next-auth";
import { authOptionsFor, DEV_USER } from "@/adapters/auth/dev";
import { getSecretaryRuntime } from "@/adapters/runtime";

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }
}

declare module "next-auth" {
  interface Session {
    /**
     * `user_profiles.user_id` に使うユーザの識別子
     *
     * JWT の `sub` をそのまま渡す (Google なら Google の subject)
     */
    user?: DefaultSession["user"] & { id?: string };
  }
}

export const authOptions: NextAuthOptions = authOptionsFor(
  getSecretaryRuntime().sources.auth,
  {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  DEV_USER,
);
