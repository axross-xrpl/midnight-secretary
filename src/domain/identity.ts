import type { Result } from "@/lib/result";
import type { IsoDate, IsoDateTime, UserId } from "./identifiers";

/**
 * 証明書がどこに載っているか
 *
 * `memory` は Fake のインメモリで、発行時刻だけを持つ
 * `midnight` は Midnight のコントラクトで、生年月日のコミットメントとコントラクトのアドレスを持つ
 * on-chain には登録の時刻が残らないので `midnight` に `registeredAt` は無い
 */
export type AgeCredentialOrigin =
  | { kind: "memory"; registeredAt: IsoDateTime }
  | { kind: "midnight"; dobCommitment: string; contractAddress: string };

/**
 * 生年月日の登録 (identity は公開される commitment の鍵、生年月日は非公開)
 */
export type AgeRegistration = {
  userId: UserId;
  identity: string;
  origin: AgeCredentialOrigin;
};

/**
 * 成人の証明 (通ったものだけ trip に残る)
 *
 * `cutoffDate` は公開の引数、`proofRef` は証明の tx id か Fake の採番
 */
export type AgeProof = {
  identity: string;
  cutoffDate: IsoDate;
  proofRef: string;
  provedAt: IsoDateTime;
};

/**
 * 証明の結果
 *
 * 落ちたときも証明自体は成功していて、結果が「成人ではない」(Compact の proveAdult は Boolean を返す)
 */
export type AdultProofOutcome =
  | { kind: "adult"; proof: AgeProof }
  | { kind: "notAdult"; cutoffDate: IsoDate };

/**
 * 年齢確認の操作で起こりうる失敗
 */
export type IdentityError =
  | { kind: "notRegistered" }
  | { kind: "alreadyRegistered"; identity: string }
  | { kind: "proofFailed"; cause: unknown }
  | { kind: "unavailable"; cause: unknown };

/**
 * 生年月日の commitment を identity に登録する (identity ごとに 1 回)
 *
 * 生年月日そのものは private state に留まり、公開されるのは commitment だけ
 */
export type RegisterBirthDate = (
  userId: UserId,
  birthDate: IsoDate,
  now: IsoDateTime,
) => Promise<Result<AgeRegistration, IdentityError>>;

/**
 * ユーザの登録を読み取る
 *
 * 未登録なら undefined に解決する
 */
export type ReadRegistration = (
  userId: UserId,
) => Promise<Result<AgeRegistration | undefined, IdentityError>>;

/**
 * `cutoffDate` 以前に生まれたこと (= その日を基準にした年齢の下限を満たすこと) を証明する
 *
 * 公開されるのは `cutoffDate` と Boolean の結果だけで、生年月日は出ない
 */
export type ProveAdult = (
  userId: UserId,
  cutoffDate: IsoDate,
  now: IsoDateTime,
) => Promise<Result<AdultProofOutcome, IdentityError>>;

/**
 * 年齢確認の port
 *
 * Fake はメモリ、real は contract server の `/age-verification/*`
 */
export type IdentityPort = {
  registerBirthDate: RegisterBirthDate;
  readRegistration: ReadRegistration;
  proveAdult: ProveAdult;
};
