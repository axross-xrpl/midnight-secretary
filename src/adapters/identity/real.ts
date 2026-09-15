import type { IsoDate, IsoDateTime, UserId } from "@/domain/identifiers";
import type {
  AdultProofOutcome,
  AgeRegistration,
  IdentityError,
  IdentityPort,
} from "@/domain/identity";
import type {
  ContractProved,
  ContractRegistered,
  ContractRegistration,
} from "@/lib/dev-contracts/age-verification";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";

/**
 * real が contract server を叩くための依存
 *
 * 本番は `@/lib/dev-contracts/age-verification` の 3 関数と、runtime の `identityOf` を渡す
 */
export type RealIdentityDeps = {
  readRegistration: (accountRef: string) => Promise<ContractRegistration>;
  register: (
    accountRef: string,
    dateOfBirth: string,
  ) => Promise<ContractRegistered>;
  prove: (accountRef: string, cutoffDate: string) => Promise<ContractProved>;
  accountRefOf: (userId: UserId) => string;
};

// contract server と circuit は日付を YYYYMMDD の 8 桁で持つ
const compact = (date: IsoDate): string => {
  return date.replaceAll("-", "");
};

const messageOf = (cause: unknown): string => {
  if (cause instanceof Error) {
    return cause.message;
  }

  return String(cause);
};

const unavailableOf = (cause: unknown): IdentityError => {
  return { kind: "unavailable", cause };
};

// contract server は circuit の assert の文言をそのまま 500 の `error` に載せるので、期待される失敗は文字列の一致でしか見分けられない
// 登録済みは `identity` を要するので、事前の読み取りで identity が判っている登録の経路だけがこの対応づけを使う
const registerErrorOf = (identity: string, cause: unknown): IdentityError => {
  if (messageOf(cause).includes("Identity already registered")) {
    return { kind: "alreadyRegistered", identity };
  }

  return unavailableOf(cause);
};

// 証明の経路で期待される失敗は未登録だけで、判定は登録と同じく文言の一致による
const proveErrorOf = (cause: unknown): IdentityError => {
  if (messageOf(cause).includes("Identity not registered")) {
    return { kind: "notRegistered" };
  }

  return unavailableOf(cause);
};

// 登録済みなのに commitment が無いのは API の約束が破られた状態なので、黙って空で通さない
const registrationOf = (
  userId: UserId,
  contract: ContractRegistration,
): Result<AgeRegistration | undefined, IdentityError> => {
  if (!contract.registered) {
    return ok(undefined);
  }

  if (contract.dobCommitment === undefined) {
    return err(
      unavailableOf(
        new Error(
          "contract server reported a registration without dobCommitment",
        ),
      ),
    );
  }

  return ok({
    userId,
    identity: contract.identity,
    origin: {
      kind: "midnight",
      dobCommitment: contract.dobCommitment,
      contractAddress: contract.contractAddress,
    },
  });
};

const readRegistration = async (
  deps: RealIdentityDeps,
  userId: UserId,
  accountRef: string,
): Promise<Result<AgeRegistration | undefined, IdentityError>> => {
  const contract = await fromPromise(
    deps.readRegistration(accountRef),
    unavailableOf,
  );

  if (!contract.ok) {
    return contract;
  }

  return registrationOf(userId, contract.value);
};

const registerBirthDate = async (
  deps: RealIdentityDeps,
  userId: UserId,
  birthDate: IsoDate,
): Promise<Result<AgeRegistration, IdentityError>> => {
  const accountRef = deps.accountRefOf(userId);
  const before = await fromPromise(
    deps.readRegistration(accountRef),
    unavailableOf,
  );

  if (!before.ok) {
    return before;
  }

  const identity = before.value.identity;

  if (before.value.registered) {
    return err({ kind: "alreadyRegistered", identity });
  }

  const registered = await fromPromise(
    deps.register(accountRef, compact(birthDate)),
    (cause) => registerErrorOf(identity, cause),
  );

  if (!registered.ok) {
    return registered;
  }

  // register の応答には commitment とアドレスが無いので読み直す (ループバックの HTTP なので往復は許容する)
  const after = await readRegistration(deps, userId, accountRef);

  if (!after.ok) {
    return after;
  }

  if (after.value === undefined) {
    return err(
      unavailableOf(
        new Error("contract server does not report the registration just made"),
      ),
    );
  }

  return ok(after.value);
};

const proveAdult = async (
  deps: RealIdentityDeps,
  userId: UserId,
  cutoffDate: IsoDate,
  now: IsoDateTime,
): Promise<Result<AdultProofOutcome, IdentityError>> => {
  const requested = compact(cutoffDate);
  const proved = await fromPromise(
    deps.prove(deps.accountRefOf(userId), requested),
    proveErrorOf,
  );

  if (!proved.ok) {
    return proved;
  }

  // サーバ側の cutoff の解釈が変わったことに黙って気づかないよう、返ってきた cutoff を要求と突き合わせる
  if (proved.value.cutoffDate !== requested) {
    return err({
      kind: "proofFailed",
      cause: new Error(
        `contract server proved cutoff ${proved.value.cutoffDate} for the requested ${requested}`,
      ),
    });
  }

  if (!proved.value.isAdult) {
    return ok({ kind: "notAdult", cutoffDate });
  }

  return ok({
    kind: "adult",
    proof: {
      identity: proved.value.identity,
      cutoffDate,
      proofRef: proved.value.txId,
      provedAt: now,
    },
  });
};

/**
 * contract server の `/age-verification/*` を使う年齢確認
 *
 * 本物なのは circuit と証明と on-chain の記録で、秘密 (生年月日と identity secret) は contract server が持つ
 * 生年月日を HTTP で渡す形は Wave 1 の暫定で、本来はクライアントに留めるべきもの
 * `registerBirthDate` の `now` は port の型なので受け取るが、on-chain には登録の時刻が残らないので `midnight` の origin では使わない
 * 証明の参照には contract server が返す tx id を使うので、Fake のような採番は要らない
 */
export const createRealIdentity = (deps: RealIdentityDeps): IdentityPort => {
  return {
    registerBirthDate: (userId, birthDate) =>
      registerBirthDate(deps, userId, birthDate),
    readRegistration: (userId) =>
      readRegistration(deps, userId, deps.accountRefOf(userId)),
    proveAdult: (userId, cutoffDate, now) =>
      proveAdult(deps, userId, cutoffDate, now),
  };
};
