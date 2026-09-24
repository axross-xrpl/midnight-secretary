import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { UserProfile } from "@/db/schema";
import { userProfiles } from "@/db/schema";
import type { Priority } from "@/features/profile/constants";
import { priorities } from "@/features/profile/constants";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import type {
  ProfileOwner,
  ProfileReadError,
  ProfileSettingsPort,
  ProfileWriteError,
} from "@/features/profile/settings-port";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { postgresErrorCode } from "../pg-error";

type Db = ReturnType<typeof getDb>;

type ProfileRow = Omit<UserProfile, "userId" | "nationality" | "createdAt">;

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

// priority は DB の CHECK で 3 値に絞られているが、型の上では text なのでここで絞る
// CHECK を外れた値は不変条件の違反なので throw し、呼び出し側で unavailable にする
const priorityOf = (raw: string | null): Priority | null => {
  // 列の値が DTO (JSON の境界) の null にそのまま写るので、null と比べる
  if (raw === null) {
    return null;
  }

  const priority = priorities.find((value) => value === raw);

  if (priority === undefined) {
    throw new Error(`bug: user_profiles.priority is ${raw}`);
  }

  return priority;
};

const profileDtoOf = (row: ProfileRow): ProfileDto => {
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
    priority: priorityOf(row.priority),
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
  const rows = await db
    .select(PROFILE_COLUMNS)
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const row = rows.at(0);

  if (row === undefined) {
    return undefined;
  }

  return profileDtoOf(row);
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

// timestamptz はマイクロ秒まで持つが Date はミリ秒までなので、1 ミリ秒の幅で突き合わせる
const millisecondRange = (updatedAt: string) => {
  const start = new Date(updatedAt);

  return { start, end: new Date(start.getTime() + 1) };
};

const insertProfile = async (
  db: Db,
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  const inserted = await db
    .insert(userProfiles)
    .values({
      userId: owner.userId,
      email: owner.email,
      ...profileValues(input),
    })
    .onConflictDoNothing({ target: userProfiles.userId })
    .returning();
  const created = inserted.at(0);

  // 行が既にあるのに取得時の `updatedAt` が無い = 別経路で作られた
  if (created === undefined) {
    return err({ kind: "conflict" });
  }

  return ok(profileDtoOf(created));
};

const updateProfile = async (
  db: Db,
  owner: ProfileOwner,
  input: ProfileSaveInput,
  updatedAt: string,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  const expectedUpdatedAt = millisecondRange(updatedAt);
  const rows = await db
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
  const updated = rows.at(0);

  if (updated !== undefined) {
    return ok(profileDtoOf(updated));
  }

  const current = await readProfileRow(db, owner.userId);

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  return err({ kind: "conflict" });
};

/**
 * 自分のプロフィールを保存する
 *
 * `updatedAt` が無いときは未登録として INSERT、あるときは同時編集を検知しつつ UPDATE する
 * どちらも `user_id` はセッション由来なので、他人の行には触れない
 */
const saveProfileRow = async (
  db: Db,
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  if (input.updatedAt === undefined) {
    return insertProfile(db, owner, input);
  }

  return updateProfile(db, owner, input, input.updatedAt);
};

// getDb() は DATABASE_URL が無いと同期的に投げるので、try の中で呼んで問い合わせの失敗と同じ unavailable にする
const readProfile = async (
  userId: string,
): Promise<Result<ProfileDto | undefined, ProfileReadError>> => {
  try {
    return ok(await readProfileRow(getDb(), userId));
  } catch (cause) {
    return err({ kind: "unavailable", cause });
  }
};

// 想定の失敗 (制約違反) は種類ごとに、それ以外の DB の失敗は原因ごと unavailable にする
const saveProfile = async (
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Promise<Result<ProfileDto, ProfileWriteError>> => {
  try {
    return await saveProfileRow(getDb(), owner, input);
  } catch (cause) {
    return err(classifyDatabaseError(cause) ?? { kind: "unavailable", cause });
  }
};

/**
 * NeonDB の `user_profiles` を設定画面の port として読み書きする
 *
 * 接続は各呼び出しの getDb() が持ち、`DATABASE_URL` が無いことも含めて DB の失敗は例外にせず値で返す
 */
export const createNeonProfileSettings = (): ProfileSettingsPort => {
  return { readProfile, saveProfile };
};
