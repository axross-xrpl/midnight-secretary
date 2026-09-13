import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import type { AuthSource } from "@/application/sources";
import type { UserId } from "@/domain/identifiers";
import { mustParse, parseUserId } from "@/domain/identifiers.parse";
import type { GoogleCredentials } from "@/lib/google-token";
import {
  isAccessTokenExpired,
  refreshGoogleAccessToken,
} from "@/lib/google-token";

/**
 * dev サインインが生み出す唯一のユーザ
 *
 * このセッションには Google のトークンが存在しない
 */
export type DevUser = {
  id: UserId;
  name: string;
  email: string;
};

/**
 * dev サインインでサインインするユーザ
 *
 * demo データのキーにできるよう固定している
 */
export const DEV_USER: DevUser = {
  id: mustParse(parseUserId("dev-user")),
  name: "Dev User",
  email: "dev@example.com",
};

/**
 * dev サインインのために next-auth の `signIn` に渡す provider id
 */
export const DEV_PROVIDER_ID = "dev";

const GOOGLE_SCOPE =
  "openid email profile https://www.googleapis.com/auth/calendar.events";

const googleProvider = (google: GoogleCredentials) => {
  return GoogleProvider({
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    authorization: {
      params: {
        access_type: "offline",
        prompt: "consent",
        scope: GOOGLE_SCOPE,
      },
    },
  });
};

/**
 * セッションにユーザの識別子を載せる
 *
 * `user_profiles.user_id` に使う。JWT 戦略では `sub` が Google の subject、
 * dev サインインでは Credentials が返した id (`dev-user`) になるので、経路で分岐しない
 */
const sessionWithUserId: NonNullable<NextAuthOptions["callbacks"]>["session"] =
  ({ session, token }) => ({
    ...session,
    user: { ...session.user, id: token.sub },
  });

const googleOptions = (google: GoogleCredentials): NextAuthOptions => {
  return {
    session: { strategy: "jwt" },
    providers: [googleProvider(google)],
    callbacks: {
      session: sessionWithUserId,
      // トークンは JWT cookie の中だけに置き、session には渡さない
      // 期限切れのトークンは session を読むたびにここで更新して cookie に書き戻す
      jwt: async ({ token, account }) => {
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
          google,
          { fetch, nowMs: Date.now() },
        );

        // 更新に失敗したら期限切れのトークンをそのまま残す
        // 失敗は Route Handler が報告する
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
};

const devOptions = (devUser: DevUser): NextAuthOptions => {
  return {
    session: { strategy: "jwt" },
    providers: [
      CredentialsProvider({
        id: DEV_PROVIDER_ID,
        name: "Dev sign-in",
        credentials: {},
        authorize: async () => ({
          id: devUser.id,
          name: devUser.name,
          email: devUser.email,
        }),
      }),
    ],
    callbacks: { session: sessionWithUserId },
  };
};

/**
 * 選ばれたサインイン方式に応じた next-auth のオプション
 *
 * `google` は既存の provider で、カレンダーの scope とトークン更新を持つ
 * `dev` は Credentials provider で、`devUser` を 1 クリックでサインインさせ、Google のトークンは発行しない
 * dev サインインを公開ホストで動かさないようにするのは `parsePortSources` の役目なので、ここでは再検査しない
 */
export const authOptionsFor = (
  source: AuthSource,
  google: GoogleCredentials,
  devUser: DevUser,
): NextAuthOptions => {
  if (source === "dev") {
    return devOptions(devUser);
  }

  return googleOptions(google);
};
