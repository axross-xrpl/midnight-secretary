import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { userProfiles } from "@/db/schema";
import type { UserId } from "@/domain/identifiers";
import type {
  ProfileError,
  ProfileOwner,
  ProfilePort,
  ProfileSettingsPort,
  ProfileWriteError,
} from "@/domain/profile";
import type { PlanningProfile } from "@/features/profile/feasibility";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";
import { postgresErrorCode } from "@/server/pg-error";
import { birthDateOf, preferencesOf } from "./dto";

type Db = ReturnType<typeof getDb>;

const unavailable = (cause: unknown): ProfileError => {
  return { kind: "unavailable", cause };
};

const PROFILE_COLUMNS = {
  email: userProfiles.email,
  fullName: userProfiles.fullName,
  address: userProfiles.address,
  birthDate: userProfiles.birthDate,
  residencePref: userProfiles.residencePref,
  homeCity: userProfiles.homeCity,
  homeSpot: userProfiles.homeSpot,
  diningGenres: userProfiles.diningGenres,
  leisureGenres: userProfiles.leisureGenres,
  budget: userProfiles.budget,
  priority: userProfiles.priority,
  walletAddress: userProfiles.walletAddress,
  updatedAt: userProfiles.updatedAt,
};

const PLANNING_COLUMNS = {
  birthDate: userProfiles.birthDate,
  nationality: userProfiles.nationality,
  residencePref: userProfiles.residencePref,
  homeCity: userProfiles.homeCity,
  homeSpot: userProfiles.homeSpot,
  diningGenres: userProfiles.diningGenres,
  leisureGenres: userProfiles.leisureGenres,
  budget: userProfiles.budget,
  priority: userProfiles.priority,
};

const toDto = (row: typeof userProfiles.$inferSelect): ProfileDto => {
  return {
    email: row.email,
    fullName: row.fullName,
    address: row.address,
    birthDate: row.birthDate,
    residencePref: row.residencePref,
    homeCity: row.homeCity,
    homeSpot: row.homeSpot,
    diningGenres: row.diningGenres,
    leisureGenres: row.leisureGenres,
    budget: row.budget,
    priority: row.priority as ProfileDto["priority"],
    walletAddress: row.walletAddress,
    updatedAt: row.updatedAt.toISOString(),
  };
};

/**
 * 自分のプロフィールを読む
 *
 * 行が無ければ未登録。画面は空のフォームを出す
 */
const readProfileRow = async (
  db: Db,
  userId: string,
): Promise<ProfileDto | undefined> => {
  const [row] = await db
    .select(PROFILE_COLUMNS)
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (row === undefined) {
    return undefined;
  }

  return {
    ...row,
    priority: row.priority as ProfileDto["priority"],
    updatedAt: row.updatedAt.toISOString(),
  };
};

/**
 * 手配に使うプロフィールを読む
 *
 * 画面用の行とは別に、本人確認の判定に要る `nationality` を含め、表示だけの項目は読まない
 */
const readPlanningRow = async (
  db: Db,
  userId: string,
): Promise<PlanningProfile | undefined> => {
  const [row] = await db
    .select(PLANNING_COLUMNS)
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (row === undefined) {
    return undefined;
  }

  return { ...row, priority: row.priority as PlanningProfile["priority"] };
};

const classifyDatabaseError = (
  error: unknown,
): ProfileWriteError | undefined => {
  const code = postgresErrorCode(error);

  if (code === "23505") {
    return { kind: "duplicateEmail" };
  }

  if (code === "23502" || code === "23514" || code === "22P02") {
    return { kind: "constraintViolation" };
  }

  return undefined;
};

/**
 * 本画面が持つ列だけを取り出す
 *
 * `wallet_address` は SCR-04c ができるまでの暫定で本画面が持つ
 * `nationality` は MVP では画面を持たないので触らない
 * `email` は INSERT のときだけ入れる (UNIQUE 制約があるため更新では動かさない)
 */
const profileValues = (input: ProfileSaveInput) => {
  return {
    fullName: input.fullName,
    address: input.address,
    birthDate: input.birthDate,
    residencePref: input.residencePref,
    homeCity: input.homeCity,
    homeSpot: input.homeSpot,
    diningGenres: input.diningGenres,
    leisureGenres: input.leisureGenres,
    budget: input.budget,
    priority: input.priority,
    walletAddress: input.walletAddress,
  };
};

// timestamptz はマイクロ秒まで持つが Date はミリ秒までなので、1ミリ秒の幅で突き合わせる
const millisecondRange = (updatedAt: string) => {
  const start = new Date(updatedAt);

  return { start, end: new Date(start.getTime() + 1) };
};

const insertProfile = async (
  db: Db,
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  const [created] = await db
    .insert(userProfiles)
    .values({
      userId: owner.userId,
      email: owner.email,
      ...profileValues(input),
    })
    .onConflictDoNothing({ target: userProfiles.userId })
    .returning();

  // 行が既にあるのに取得時の `updatedAt` が無い = 別経路で作られた
  return created ? ok(toDto(created)) : err({ kind: "conflict" });
};

const updateProfile = async (
  db: Db,
  owner: ProfileOwner,
  input: ProfileSaveInput,
  updatedAt: string,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const [updated] = await db
    .update(userProfiles)
    .set({ ...profileValues(input), updatedAt: new Date() })
    .where(
      and(
        eq(userProfiles.userId, owner.userId),
        gte(userProfiles.updatedAt, expectedUpdatedAt.start),
        lt(userProfiles.updatedAt, expectedUpdatedAt.end),
      ),
    )
    .returning();

  if (updated) {
    return ok(toDto(updated));
  }

  const current = await readProfileRow(db, owner.userId);

  return err(
    current === undefined ? { kind: "notFound" } : { kind: "conflict" },
  );
};

/**
 * 自分のプロフィールを保存する
 *
 * `updatedAt` が無いときは未登録として INSERT、あるときは同時編集を検知しつつ UPDATE する
 * どちらも `user_id` はセッション由来なので、他人の行には触れない
 * 制約違反は種類ごとの失敗に、それ以外の DB の失敗は原因ごと `unavailable` にする
 */
const saveProfile = async (
  db: Db,
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  try {
    if (input.updatedAt === undefined) {
      return await insertProfile(db, owner, input);
    }

    return await updateProfile(db, owner, input, input.updatedAt);
  } catch (cause) {
    return err(classifyDatabaseError(cause) ?? { kind: "unavailable", cause });
  }
};

const readProfile = async (
  userId: UserId,
): Promise<Result<ProfileDto | undefined, ProfileError>> => {
  return fromPromise(readProfileRow(getDb(), userId), unavailable);
};

/**
 * NeonDB のプロフィール (#16 の `user_profiles`) を読み書きする
 *
 * `DATABASE_URL` の扱いは `getDb()` に任せ、接続や問い合わせの失敗は `unavailable` にする
 * 秘書向けの生年月日と好みは、画面用の行から `dto.ts` の導き方で取り出す
 */
export const createNeonProfile = (): ProfilePort & ProfileSettingsPort => {
  return {
    readBirthDate: async (userId) => {
      const profile = await readProfile(userId);

      if (!profile.ok) {
        return profile;
      }

      return birthDateOf(profile.value);
    },
    readPreferences: async (userId) => {
      const profile = await readProfile(userId);

      if (!profile.ok) {
        return profile;
      }

      return ok(preferencesOf(profile.value));
    },
    readProfile,
    readPlanningProfile: async (userId) =>
      fromPromise(readPlanningRow(getDb(), userId), unavailable),
    saveProfile: async (owner, input) => {
      try {
        return await saveProfile(getDb(), owner, input);
      } catch (cause) {
        return err({ kind: "unavailable", cause });
      }
    },
  };
};
