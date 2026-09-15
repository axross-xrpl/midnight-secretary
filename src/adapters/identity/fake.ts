import type { IsoDate, IsoDateTime, UserId } from "@/domain/identifiers";
import type {
  AdultProofOutcome,
  AgeRegistration,
  IdentityError,
  IdentityPort,
} from "@/domain/identity";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";

/**
 * Fake が採番するもの (テストでは閉じたカウンタ、runtime では sha256 と randomUUID)
 */
export type FakeIdentityIds = {
  identityOf: (userId: UserId) => string;
  newProofRef: () => string;
};

/**
 * Fake の identity に渡す採番の関数
 */
export type FakeIdentitySeed = {
  ids: FakeIdentityIds;
};

// 登録 1 件で、生年月日は private state に当たるのでこのモジュールの外に出さない
type AgeRecord = {
  birthDate: IsoDate;
  registration: AgeRegistration;
};

type FakeIdentityState = {
  records: Readonly<Record<UserId, AgeRecord>>;
};

// 登録はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const recordRegistration = (
  state: FakeIdentityState,
  record: AgeRecord,
): void => {
  state.records = {
    ...state.records,
    [record.registration.userId]: record,
  };
};

const register = (
  state: FakeIdentityState,
  ids: FakeIdentityIds,
  userId: UserId,
  birthDate: IsoDate,
  now: IsoDateTime,
): Result<AgeRegistration, IdentityError> => {
  const existing = state.records[userId];

  if (existing !== undefined) {
    return err({
      kind: "alreadyRegistered",
      identity: existing.registration.identity,
    });
  }

  const registration: AgeRegistration = {
    userId,
    identity: ids.identityOf(userId),
    origin: { kind: "memory", registeredAt: now },
  };

  recordRegistration(state, { birthDate, registration });

  return ok(registration);
};

// Compact の `proveAdult` と同じ向きの比較 (`dateOfBirth <= cutoffDate`)
// ISO の暦日は文字列の比較で時系列になる
const prove = (
  state: FakeIdentityState,
  ids: FakeIdentityIds,
  userId: UserId,
  cutoffDate: IsoDate,
  now: IsoDateTime,
): Result<AdultProofOutcome, IdentityError> => {
  const record = state.records[userId];

  if (record === undefined) {
    return err({ kind: "notRegistered" });
  }

  if (record.birthDate > cutoffDate) {
    return ok({ kind: "notAdult", cutoffDate });
  }

  return ok({
    kind: "adult",
    proof: {
      identity: record.registration.identity,
      cutoffDate,
      proofRef: ids.newProofRef(),
      provedAt: now,
    },
  });
};

/**
 * Compact の age-verification と同じ規則を適用するメモリ上の年齢確認で、規則は identity ごとに 1 回の登録と `dateOfBirth <= cutoffDate` の判定
 *
 * 登録がリクエストをまたいで残るよう、プロセスごとに 1 回だけ作る
 * 生年月日はこのクロージャの外に出さず、返すのは identity と Boolean の結果だけ
 */
export const createFakeIdentity = (seed: FakeIdentitySeed): IdentityPort => {
  const state: FakeIdentityState = { records: {} };

  return {
    registerBirthDate: async (userId, birthDate, now) =>
      register(state, seed.ids, userId, birthDate, now),
    readRegistration: async (userId) => ok(state.records[userId]?.registration),
    proveAdult: async (userId, cutoffDate, now) =>
      prove(state, seed.ids, userId, cutoffDate, now),
  };
};
