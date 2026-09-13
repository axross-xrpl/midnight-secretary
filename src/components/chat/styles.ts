// 会話画面で共有する Tailwind のクラス文字列とアイコンの対応表
// 参考実装のデザインシートから移したもので、カード、行、バッジ、ボタンの見た目をそろえる

/**
 * 中身を置く素のカード (参考実装のプロフィールとタスクのカード)
 */
export const cardClass =
  "rounded-xl border border-border bg-surface p-[18px] px-5";

/**
 * 空のときに出す箱
 */
export const emptyStateClass =
  "rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-muted";

/**
 * 塗りつぶした主要な操作のボタン
 */
export const primaryButtonClass =
  "cursor-pointer rounded-[10px] bg-accent px-[18px] py-2 text-[13px] font-semibold text-white disabled:cursor-default disabled:opacity-40";

/**
 * 決め手になる段 (承認と支払い) の塗りつぶしボタン
 */
export const strongButtonClass =
  "cursor-pointer rounded-[10px] bg-accent px-[18px] py-[9px] text-[13.5px] font-bold text-white disabled:cursor-default disabled:opacity-40";

/**
 * 枠線だけの補助のボタン
 */
export const ghostButtonClass =
  "cursor-pointer rounded-[10px] border border-ghost-border bg-surface px-[18px] py-2 text-[13px] font-medium text-ink disabled:cursor-default disabled:opacity-40";

/**
 * 区画の上に置く見出し
 */
export const sectionLabelClass = "text-[12.5px] font-bold text-muted";

/**
 * タイトルの下に置く補足の行
 */
export const labelClass = "text-[11.5px] text-muted";

/**
 * 小さく薄い注記
 */
export const faintLabelClass = "text-[11px] text-faint";

const pillClass = "rounded-full px-2.5 py-[3px] text-[11px] font-semibold";

/**
 * 公開台帳に載るものを示すバッジ
 */
export const publicPillClass = `${pillClass} bg-public-bg text-public`;

/**
 * 非公開データのままのものを示すバッジ
 */
export const privatePillClass = `${pillClass} bg-private-bg text-private`;

/**
 * エラーを出す箱
 */
export const dangerBoxClass =
  "rounded-[10px] bg-danger-bg px-4 py-2.5 text-[12.5px] font-semibold text-danger";

/**
 * 出張の候補の種類 (交通手段 2 つと宿泊)
 *
 * 交通手段は `TransportOfferResponse.mode` と同じ値
 */
export type VendorKind = "rail" | "air" | "lodging";

/**
 * 出張の候補 1 件のアイコンと丸の色 (交通手段か宿泊かで分ける)
 */
export const vendorMark = {
  rail: { icon: "\u{1F684}", circleClass: "bg-rail" },
  air: { icon: "✈", circleClass: "bg-air" },
  lodging: { icon: "\u{1F3E8}", circleClass: "bg-hotel" },
} as const satisfies Record<VendorKind, { icon: string; circleClass: string }>;

/**
 * 秘書の吹き出しの左に置く丸いアバター
 */
export const secretaryAvatarClass =
  "flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white";

/**
 * 秘書の吹き出し (左、左上だけ角を立てる)
 */
export const secretaryBubbleClass =
  "flex min-w-0 max-w-[36rem] flex-col gap-3 rounded-[4px_16px_16px_16px] border border-border bg-surface px-4 py-3 text-[13px] leading-relaxed";

/**
 * ユーザの吹き出し (右、右上だけ角を立てる)
 */
export const userBubbleClass =
  "max-w-[28rem] rounded-[16px_4px_16px_16px] bg-accent px-4 py-[11px] text-[13px] leading-relaxed text-white";

/**
 * 吹き出しの下に出す時刻
 */
export const bubbleTimeClass = "pl-1 text-[11px] text-faint";

/**
 * 会話のヘッダに置く「予定一覧へ」のリンク
 */
export const backLinkClass = "self-start text-[12.5px] font-medium text-accent";

/**
 * 返答ボタンを並べるバー (ページの下端に留まる間も吹き出しが透けないよう面の色を持つ)
 */
export const replyBarClass =
  "flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-3 px-4";

/**
 * 秘書の吹き出しの中に置く明細 (支払いの承認、登録した予定) の枠
 */
export const detailListClass =
  "flex flex-col divide-y divide-border-sub overflow-hidden rounded-xl border border-border-sub bg-surface text-[12.5px]";

/**
 * 明細の 1 行 (見出しと値)
 */
export const detailRowClass = "flex flex-wrap items-center gap-3 p-3 px-3.5";

/**
 * 明細の行の見出し
 */
export const detailKeyClass =
  "w-[120px] flex-none text-[10.5px] font-bold text-faint";

/**
 * ID や参照番号など、等幅で出す値
 */
export const monoValueClass = "font-mono text-[10.5px]";

/**
 * 公開台帳に載るハッシュ (等幅、アクセント色)
 */
export const hashClass = `${monoValueClass} text-accent`;
