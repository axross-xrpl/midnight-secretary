import type { Result } from "@/lib/result";
import type {
  IsoDateTime,
  MandateId,
  PaymentRef,
  WalletAddress,
} from "./identifiers";
import type { Money, MoneyError } from "./money";
import { subtractMoney } from "./money";

/**
 * ユーザから秘書への支払いの委任を、アプリケーションから見た形で表したもの
 *
 * commitment を結び付ける秘密は Midnight adapter の private state の中に留まる
 * 上限額のトークンはコントラクトが預かり、承認のたびにそこから受取先へ送る
 */
export type Mandate = {
  id: MandateId;
  cap: Money;
  spent: Money;
  expiresAt: IsoDateTime;
  purpose: string;
  commitment: string;
};

/**
 * mandate を作るための入力
 *
 * id、秘密、commitment は adapter が生成する
 */
export type MandateDraft = {
  cap: Money;
  expiresAt: IsoDateTime;
  purpose: string;
};

/**
 * 支払い 1 件を公開台帳にどう載せるか
 *
 * `public` は unshielded 送金 (送り手、受取先、金額が公開)、`private` は shielded 送金 (受取先が非公開)
 */
export type SettlementVisibility = "public" | "private";

/**
 * 秘書が mandate に承認を求める支払い 1 件
 *
 * 支払いは候補 (事業者) ごとに 1 件で、`recipient` はその事業者の受取先
 * `visibility` は承認のときにユーザが候補ごとに選んだ公開範囲
 * circuit がまだチェーン時刻に束縛されていない (既知の未対応箇所) ので `now` を引数で渡す
 */
export type PaymentRequest = {
  mandateId: MandateId;
  paymentRef: PaymentRef;
  amount: Money;
  recipient: WalletAddress;
  visibility: SettlementVisibility;
  now: IsoDateTime;
};

/**
 * 承認と同時に行われたトークンの移動
 *
 * Wave 1 は証明と送金を 1 つの circuit で原子的に行うので、承認があれば送金もある
 * `tokenTransfer` は unshielded、`shieldedTransfer` は shielded の送金で、選ぶのは `PaymentRequest.visibility`
 * 承認だけで送金を後回しにする形が要るようになったら (Wave 2 の Lace 連携など) ここに variant を足す
 */
export type Settlement =
  | { kind: "tokenTransfer"; transactionId: string; recipient: WalletAddress }
  | {
      kind: "shieldedTransfer";
      transactionId: string;
      recipient: WalletAddress;
    };

/**
 * 支払いが mandate のもとで承認され、トークンが受取先へ送られた証拠
 *
 * この支払いについて公開台帳に載る値は `publicHash` と送金の tx だけ
 */
export type Authorization = {
  mandateId: MandateId;
  paymentRef: PaymentRef;
  amount: Money;
  authorizedAt: IsoDateTime;
  publicHash: string;
  settlement: Settlement;
};

/**
 * mandate について誰でも公開台帳から読み取れる内容
 *
 * 金額、上限、個人を特定する情報は意図的に含めない
 */
export type PublicLedgerView = {
  commitments: readonly { mandateId: MandateId; commitment: string }[];
  authorizations: readonly { publicHash: string }[];
  authorizedCount: number;
};

/**
 * mandate の操作で起こりうる失敗
 */
export type MandateError =
  | { kind: "notFound"; mandateId: MandateId }
  | { kind: "overBudget"; cap: Money; spent: Money; requested: Money }
  | { kind: "expired"; expiresAt: IsoDateTime; now: IsoDateTime }
  | { kind: "alreadyAuthorized"; paymentRef: PaymentRef }
  | { kind: "proofFailed"; cause: unknown }
  | { kind: "unavailable"; cause: unknown };

/**
 * mandate を作り、その commitment を公開する
 *
 * 上限額のトークンをコントラクトに預けるところまでを含む
 */
export type CreateMandate = (
  draft: MandateDraft,
) => Promise<Result<Mandate, MandateError>>;

/**
 * 支払いが mandate に収まることを証明し、受取先へトークンを送って承認を記録する
 *
 * 証明と送金は 1 つのトランザクションで行い、どちらか片方だけが残ることはない
 */
export type AuthorizePayment = (
  request: PaymentRequest,
) => Promise<Result<Authorization, MandateError>>;

/**
 * mandate 1 件の private な見え方を読み取る
 *
 * 知らない mandate のときは undefined に解決する
 */
export type ReadMandate = (
  mandateId: MandateId,
) => Promise<Result<Mandate | undefined, MandateError>>;

/**
 * 公開台帳に承認があるかを調べる
 *
 * `isAuthorized` circuit と対応する
 */
export type IsAuthorized = (
  mandateId: MandateId,
  paymentRef: PaymentRef,
) => Promise<Result<boolean, MandateError>>;

/**
 * 公開台帳の見え方を読み取る
 */
export type ReadPublicLedger = () => Promise<
  Result<PublicLedgerView, MandateError>
>;

/**
 * adapter が扱える支払いの形
 *
 * `privateSettlement` が false の adapter に `visibility: "private"` を渡してはいけない (use case が先に弾く)
 * adapter を作った時点で決まるので関数ではなく値で持つ
 */
export type MandateCapabilities = {
  privateSettlement: boolean;
};

/**
 * Compact のコントラクトに裏打ちされた mandate の機能
 *
 * どこで動くか (サーバ側のエージェントウォレットかブラウザのウォレットか) は adapter の関心事
 */
export type MandatePort = {
  capabilities: MandateCapabilities;
  createMandate: CreateMandate;
  authorizePayment: AuthorizePayment;
  readMandate: ReadMandate;
  isAuthorized: IsAuthorized;
  readPublicLedger: ReadPublicLedger;
};

/**
 * 上限から使用済みを引いた残り
 *
 * 純粋関数
 */
export const remainingAllowance = (
  mandate: Mandate,
): Result<Money, MoneyError> => {
  return subtractMoney(mandate.cap, mandate.spent);
};
