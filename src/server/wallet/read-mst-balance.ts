import "server-only";

/**
 * 保有しているデモトークンの残高
 *
 * 単位は `token.compact` が発行する MST (`basic-spec.md` の JPYC に相当するデモ用トークン)
 */
export type MstBalance = {
  symbol: string;
  amount: number;
};

/**
 * 画面に出す残高
 *
 * contract サーバー (`contract/src/server.ts`) はアドレスごとの残高を返す経路を持たず、
 * `/token/state` が返すのは名称・記号・色と送金枠の残りだけなので、今は固定値を返す。
 * 残高の取得が生えたらこの関数の中だけを差し替える
 */
export async function readMstBalance(): Promise<MstBalance> {
  return { symbol: "MST", amount: 128_500 };
}
