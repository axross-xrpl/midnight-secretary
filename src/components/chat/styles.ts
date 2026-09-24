// 会話画面で共有する Tailwind のクラス文字列とアイコンの対応表
// 参考実装のデザインシートから移したもので、カード、行、バッジ、ボタンの見た目をそろえる

/**
 * 中身を置く素のカード (参考実装のプロフィールとタスクのカード)
 */
export const cardClass = "rounded-xl border border-border bg-surface p-6";

/**
 * サイドバーに置く少し詰めたカード (`cardClass` より padding を 1 段減らす)
 */
export const sidebarCardClass =
  "rounded-xl border border-border bg-surface p-5";

/**
 * 空のときに出す箱
 */
export const emptyStateClass =
  "rounded-xl border border-border bg-surface p-6 text-center text-base text-muted";

/**
 * 一覧の 1 行をそれ自体のカードにしたもの (予定一覧の行)
 */
export const rowCardClass =
  "flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface px-6 py-4";

/**
 * 塗りつぶした主要な操作のボタン
 */
export const primaryButtonClass =
  "cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-base font-semibold text-white hover:bg-accent-strong disabled:cursor-default disabled:opacity-40 disabled:hover:bg-accent";

/**
 * 決め手になる段 (承認と支払い) の塗りつぶしボタン
 */
export const strongButtonClass =
  "cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-base font-bold text-white hover:bg-accent-strong disabled:cursor-default disabled:opacity-40 disabled:hover:bg-accent";

/**
 * 枠線だけの補助のボタン
 */
export const ghostButtonClass =
  "cursor-pointer rounded-lg border border-ghost-border bg-surface px-5 py-2.5 text-base font-medium text-ink disabled:cursor-default disabled:opacity-40";

/**
 * 一覧の行に置く塗りつぶしボタン (`primaryButtonClass` を行の大きさに合わせたもの)
 */
export const smallPrimaryButtonClass =
  "cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-default disabled:opacity-50 disabled:hover:bg-accent";

/**
 * 一覧の行に置く、取り消せない操作を切り出すボタン (薄い赤地に赤い字)
 */
export const smallDangerGhostButtonClass =
  "cursor-pointer rounded-md bg-danger-bg px-4 py-2 text-sm font-semibold text-danger disabled:cursor-default disabled:opacity-50";

/**
 * 一覧の行に置く、取り消せない操作を確かめるボタン (赤く塗る)
 */
export const smallDangerButtonClass =
  "cursor-pointer rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50";

/**
 * 一覧の行に置く控えめなボタン (`ghostButtonClass` を行の大きさに合わせたもの)
 */
export const smallGhostButtonClass =
  "cursor-pointer rounded-md border border-ghost-border bg-surface px-4 py-2 text-sm font-medium text-ink disabled:cursor-default disabled:opacity-50";

/**
 * 区画の上に置く見出し
 */
export const sectionLabelClass = "text-sm font-medium text-muted";

/**
 * タイトルの下に置く補足の行
 */
export const labelClass = "text-sm text-muted";

/**
 * 小さく薄い注記
 */
export const faintLabelClass = "text-xs text-faint";

const pillClass = "rounded-full px-2.5 py-0.5 text-xs font-semibold";

/**
 * 何も起きていないことを示すバッジ (未手配)
 */
export const neutralPillClass = `${pillClass} bg-neutral-bg text-muted`;

/**
 * 進んでいる途中を示すバッジ (提案済み、承認済み)
 */
export const accentPillClass = `${pillClass} bg-accent-bg text-accent`;

/**
 * 公開台帳に載るものを示すバッジ
 */
export const publicPillClass = `${pillClass} bg-public-bg text-public`;

/**
 * 非公開データのままのものを示すバッジ
 */
export const privatePillClass = `${pillClass} bg-private-bg text-private`;

/**
 * やり終えたことを示すバッジ (登録済み)
 */
export const okPillClass = `${pillClass} bg-ok-bg text-ok`;

/**
 * エラーを出す箱
 */
export const dangerBoxClass =
  "rounded-lg bg-danger-bg px-4 py-2.5 text-sm font-semibold text-danger";

/**
 * 出張の候補の種類 (交通手段 2 つ、宿泊、飲食、レジャー)
 *
 * 交通手段は `TransportOfferResponse.mode` と同じ値
 */
export type VendorKind = "rail" | "air" | "lodging" | "dining" | "leisure";

/**
 * 出張の候補 1 件のアイコンと丸の色 (交通手段か宿泊か飲食かレジャーかで分ける)
 */
export const vendorMark = {
  rail: { icon: "\u{1F684}", circleClass: "bg-rail" },
  air: { icon: "✈", circleClass: "bg-air" },
  lodging: { icon: "\u{1F3E8}", circleClass: "bg-hotel" },
  dining: { icon: "\u{1F37A}", circleClass: "bg-dining" },
  leisure: { icon: "\u{1F3AB}", circleClass: "bg-leisure" },
} as const satisfies Record<VendorKind, { icon: string; circleClass: string }>;

/**
 * 秘書の吹き出しの左に置く丸いアバター
 */
export const secretaryAvatarClass =
  "flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-sm font-bold text-white";

/**
 * 秘書の吹き出し (左、左上だけ角を立てる)
 */
export const secretaryBubbleClass =
  "flex min-w-0 max-w-[36rem] flex-col gap-4 rounded-2xl rounded-tl-sm border border-border bg-surface px-5 py-4 text-base";

/**
 * ユーザの吹き出し (右、右上だけ角を立てる)
 */
export const userBubbleClass =
  "max-w-[28rem] rounded-2xl rounded-tr-sm bg-accent px-5 py-4 text-base text-white";

/**
 * 吹き出しの下に出す時刻
 */
export const bubbleTimeClass = "pl-1 text-xs text-faint";

/**
 * 会話のヘッダに置く「予定一覧へ」のリンク
 */
export const backLinkClass = "self-start text-sm font-medium text-accent";

/**
 * 返答ボタンを並べるバー (ページの下端に留まる間も吹き出しが透けないよう面の色を持つ)
 */
export const replyBarClass =
  "flex flex-wrap gap-3 rounded-xl border border-border bg-surface p-4";

/**
 * 秘書の吹き出しの中に置く明細 (支払いの承認、登録した予定) の枠
 */
export const detailListClass =
  "flex flex-col divide-y divide-border-sub overflow-hidden rounded-xl border border-border-sub bg-surface text-sm";

/**
 * 明細の 1 行 (見出しと値)
 */
export const detailRowClass = "flex flex-wrap items-center gap-3 px-4 py-3";

/**
 * 明細の行の見出し
 */
export const detailKeyClass = "w-32 flex-none text-sm font-medium text-faint";

/**
 * ID や参照番号など、等幅で出す値
 */
export const monoValueClass = "min-w-0 break-all font-mono text-sm";

/**
 * 公開台帳に載るハッシュ (等幅、アクセント色)
 */
export const hashClass = `${monoValueClass} text-accent`;
