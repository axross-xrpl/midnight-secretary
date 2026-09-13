import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { userProfiles } from "@/db/schema";
import type { ProfileSaveInput } from "@/features/profile/schemas";
import { err, ok, type Result } from "@/lib/result";
import type { SessionUser } from "@/lib/session-user";
import { postgresErrorCode } from "@/server/pg-error";
import { readProfile } from "./read-profile";
import type { ProfileDto } from "@/features/profile/schemas";

export type ProfileWriteError =
  | { kind: "notFound" }
  | { kind: "conflict" }
  | { kind: "duplicateEmail" }
  | { kind: "constraintViolation" };

function classifyDatabaseError(error: unknown): ProfileWriteError | null {
  switch (postgresErrorCode(error)) {
    case "23505":
      return { kind: "duplicateEmail" };
    case "23502":
    case "23514":
    case "22P02":
      return { kind: "constraintViolation" };
    default:
      return null;
  }
}

/**
 * 本画面が持つ列だけを取り出す
 *
 * `wallet_address` は SCR-04c ができるまでの暫定で本画面が持つ
 * `nationality` は MVP では画面を持たないので触らない
 * `email` は INSERT のときだけ入れる (UNIQUE 制約があるため更新では動かさない)
 */
function profileValues(input: ProfileSaveInput) {
  return {
    fullName: input.fullName,
    address: input.address,
    birthDate: input.birthDate,
    residencePref: input.residencePref,
    homeCity: input.homeCity,
    homeSpot: input.homeSpot,
    diningGenres: input.diningGenres,
    leisureGenres: input.leisureGenres,
    budgetJpyc: input.budgetJpyc,
    priority: input.priority,
    walletAddress: input.walletAddress,
  };
}

// timestamptz はマイクロ秒まで持つが Date はミリ秒までなので、1ミリ秒の幅で突き合わせる
function millisecondRange(updatedAt: string) {
  const start = new Date(updatedAt);

  return { start, end: new Date(start.getTime() + 1) };
}

const toDto = (row: typeof userProfiles.$inferSelect): ProfileDto => ({
  email: row.email,
  fullName: row.fullName,
  address: row.address,
  birthDate: row.birthDate,
  residencePref: row.residencePref,
  homeCity: row.homeCity,
  homeSpot: row.homeSpot,
  diningGenres: row.diningGenres,
  leisureGenres: row.leisureGenres,
  budgetJpyc: row.budgetJpyc,
  priority: row.priority as ProfileDto["priority"],
  walletAddress: row.walletAddress,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * 自分のプロフィールを保存する
 *
 * `updatedAt` が無いときは未登録として INSERT、あるときは同時編集を検知しつつ UPDATE する
 * どちらも `user_id` はセッション由来なので、他人の行には触れない
 */
export async function saveProfile(
  user: SessionUser,
  input: ProfileSaveInput,
): Promise<Result<ProfileDto, ProfileWriteError>> {
  const db = getDb();

  try {
    if (input.updatedAt === undefined) {
      const [created] = await db
        .insert(userProfiles)
        .values({
          userId: user.userId,
          email: user.email,
          ...profileValues(input),
        })
        .onConflictDoNothing({ target: userProfiles.userId })
        .returning();

      // 行が既にあるのに取得時の `updatedAt` が無い = 別経路で作られた
      return created ? ok(toDto(created)) : err({ kind: "conflict" });
    }

    const expectedUpdatedAt = millisecondRange(input.updatedAt);
    const [updated] = await db
      .update(userProfiles)
      .set({ ...profileValues(input), updatedAt: new Date() })
      .where(
        and(
          eq(userProfiles.userId, user.userId),
          gte(userProfiles.updatedAt, expectedUpdatedAt.start),
          lt(userProfiles.updatedAt, expectedUpdatedAt.end),
        ),
      )
      .returning();

    if (updated) {
      return ok(toDto(updated));
    }

    const current = await readProfile(user.userId);

    return err(current === null ? { kind: "notFound" } : { kind: "conflict" });
  } catch (error) {
    const expectedError = classifyDatabaseError(error);

    if (expectedError) {
      return err(expectedError);
    }

    throw error;
  }
}
