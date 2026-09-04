declare const brand: unique symbol;

/**
 * 意味を持つ string / number を別名化する branded type
 *
 * brand キーは本モジュール内に閉じた unique symbol なので、外部からこの型を手書きで再現できない。
 * 値の生成は *.parse.ts のスマートコンストラクタ内で `raw as Brand<...>` によって行う (no-as-cast が強制)。
 * unique symbol は宣言したモジュールごとに別物なので、branded 値がパッケージ境界を越える構成では brand 型を共有パッケージに置く。
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
