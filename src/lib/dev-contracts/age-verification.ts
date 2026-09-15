import "server-only";
import { z } from "zod";
import { contractServerGet, contractServerPost } from "./network";

/**
 * contract server が返す登録の状態
 *
 * 未登録でも 200 で `registered: false` が返り、`dobCommitment` は登録済みのときだけ入る
 */
export type ContractRegistration = {
  identity: string;
  registered: boolean;
  dobCommitment?: string;
  contractAddress: string;
};

/**
 * contract server が返す登録の結果
 */
export type ContractRegistered = {
  identity: string;
  txId: string;
  blockHeight: number;
};

/**
 * contract server が返す証明の結果
 *
 * `cutoffDate` は `YYYYMMDD` で、`isAdult` は circuit の `proveAdult` が返した Boolean
 */
export type ContractProved = {
  identity: string;
  txId: string;
  blockHeight: number;
  cutoffDate: string;
  isAdult: boolean;
};

// 応答は境界でパースし、形が違えば throw する (呼び出し側の fromPromise が IdentityError に畳む)
const registrationSchema = z.object({
  identity: z.string(),
  registered: z.boolean(),
  dobCommitment: z.string().optional(),
  contractAddress: z.string(),
});

const registeredSchema = z.object({
  identity: z.string(),
  txId: z.string(),
  blockHeight: z.number(),
});

const provedSchema = z.object({
  identity: z.string(),
  txId: z.string(),
  blockHeight: z.number(),
  cutoffDate: z.string(),
  isAdult: z.boolean(),
});

/**
 * `GET /age-verification/registration` で `accountRef` の登録の状態を読む
 */
export const readAgeRegistration = async (
  accountRef: string,
): Promise<ContractRegistration> => {
  const raw = await contractServerGet<unknown>(
    `/age-verification/registration?accountRef=${encodeURIComponent(accountRef)}`,
  );

  return registrationSchema.parse(raw);
};

/**
 * `POST /age-verification/register` で `accountRef` に生年月日 (`YYYYMMDD`) を登録する
 */
export const registerAge = async (
  accountRef: string,
  dateOfBirth: string,
): Promise<ContractRegistered> => {
  const raw = await contractServerPost<unknown>("/age-verification/register", {
    accountRef,
    dateOfBirth,
  });

  return registeredSchema.parse(raw);
};

/**
 * `POST /age-verification/prove` で `accountRef` が `cutoffDate` (`YYYYMMDD`) 以前に生まれたことを証明する
 */
export const proveAge = async (
  accountRef: string,
  cutoffDate: string,
): Promise<ContractProved> => {
  const raw = await contractServerPost<unknown>("/age-verification/prove", {
    accountRef,
    cutoffDate,
  });

  return provedSchema.parse(raw);
};
