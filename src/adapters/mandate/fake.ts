import type { MandateId } from "@/domain/identifiers";
import type { Mandate, MandatePort } from "@/domain/mandate";
import { ok } from "@/lib/result";

/**
 * Fake が作る mandate の id と commitment を生成する
 *
 * どちらも非決定的なので注入する
 */
export type FakeMandateIds = {
  newMandateId: () => MandateId;
  newCommitment: () => string;
  hashAuthorization: (mandateId: MandateId, paymentRef: string) => string;
};

/**
 * Fake が最初に持つ mandate と、新しい mandate に使う id の関数
 */
export type FakeMandateSeed = {
  mandates: readonly Mandate[];
  ids: FakeMandateIds;
};

/**
 * circuit と同じ規則を適用するメモリ上の mandate で、規則は上限額、期限、payment ref ごとに 1 回の authorization
 *
 * `spent` がリクエストをまたいで積み上がるよう、プロセスごとに 1 回だけ作る
 */
export const createFakeMandate = (seed: FakeMandateSeed): MandatePort => {
  return {
    createMandate: async (draft) =>
      ok({
        ...draft,
        id: seed.ids.newMandateId(),
        spent: draft.cap,
        commitment: seed.ids.newCommitment(),
      }),
    authorizePayment: async (request) =>
      ok({
        ...request,
        authorizedAt: request.now,
        publicHash: "",
        settlement: {
          kind: "tokenTransfer",
          transactionId: "",
          recipient: request.recipient,
        },
      }),
    readMandate: async () => ok(undefined),
    isAuthorized: async () => ok(false),
    readPublicLedger: async () =>
      ok({ commitments: [], authorizations: [], authorizedCount: 0 }),
  };
};
