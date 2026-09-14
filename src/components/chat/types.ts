import type { SecretaryFailure } from "@/lib/secretary-response";

/**
 * 公開台帳の見え方
 *
 * domain の `PublicLedgerView` と同じ形で brand を外したもの
 * Server Component の props でしか渡らないので zod スキーマは持たない
 */
export type PublicLedgerView = {
  commitments: readonly { mandateId: string; commitment: string }[];
  authorizations: readonly { publicHash: string }[];
  authorizedCount: number;
};

/**
 * mandate の adapter が扱える支払いの形
 *
 * domain の `MandateCapabilities` と同じ形で、Server Component の props でしか渡らないので zod スキーマは持たない
 */
export type MandateCapabilities = {
  privateSettlement: boolean;
};

/**
 * 画面が扱う失敗
 *
 * サーバの封筒 (`SecretaryFailure`) に、ブラウザ側で起こる 2 つを足したもの
 */
export type RequestFailure =
  | SecretaryFailure
  | { code: "network" }
  | { code: "schema" };

/**
 * 出張を 1 段進める操作
 *
 * 最初の `propose` は支払い枠が無ければその作成も兼ねる
 */
export type Step = "propose" | "approve" | "pay" | "writeBack";

/**
 * いま進行中の 1 手
 *
 * 画面は予定 1 件だけを扱うので、予定の id は持たない
 * 休止中にどの段にいるかは持たない (trip の status から導出する)
 */
export type Activity =
  | { kind: "idle" }
  | { kind: "busy"; step: Step }
  | { kind: "failed"; step: Step; failure: RequestFailure };
