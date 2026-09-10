import type { NextAuthOptions } from "next-auth";
import { authOptionsFor, DEV_USER } from "@/adapters/auth/dev";
import { getSecretaryRuntime } from "@/adapters/runtime";

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
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
