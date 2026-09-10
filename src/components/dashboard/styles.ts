/**
 * Shared Tailwind class strings and icon maps for the dashboard.
 * Ported from the reference frontend's design sheet so cards, rows, badges, and buttons read as that system.
 */

/** Plain content card (profile and task cards in the reference). */
export const cardClass =
  "rounded-xl border border-border bg-surface p-[18px] px-5";

/** Card with a tinted body and a white footer for actions (proposal and summary cards). */
export const panelCardClass =
  "overflow-hidden rounded-xl border border-border bg-card-inner";

/** Body area of a panel card. */
export const panelBodyClass = "flex flex-col gap-4 p-3.5 px-4";

/** Footer area of a panel card that holds the action buttons. */
export const panelFooterClass =
  "flex flex-wrap gap-2 border-t border-border bg-surface p-3 px-4";

/** One list row rendered as its own card (detection list in the reference). */
export const rowCardClass =
  "flex flex-wrap items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5 px-5";

/** Empty state box. */
export const emptyStateClass =
  "rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-muted";

/** Filled call-to-action button. */
export const primaryButtonClass =
  "cursor-pointer rounded-[10px] bg-accent px-[18px] py-2 text-[13px] font-semibold text-white disabled:cursor-default disabled:opacity-40";

/** Filled button for the decisive step (approve and pay). */
export const strongButtonClass =
  "cursor-pointer rounded-[10px] bg-accent px-[18px] py-[9px] text-[13.5px] font-bold text-white disabled:cursor-default disabled:opacity-40";

/** Outlined secondary button. */
export const ghostButtonClass =
  "cursor-pointer rounded-[10px] border border-ghost-border bg-surface px-[18px] py-2 text-[13px] font-medium text-ink disabled:cursor-default disabled:opacity-40";

/** Compact filled button used inside list rows. */
export const smallPrimaryButtonClass =
  "cursor-pointer rounded-[9px] bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:cursor-default disabled:opacity-50";

/**
 * 一覧の行に置く控えめなボタン (`ghostButtonClass` を行の大きさに合わせたもの)
 */
export const smallGhostButtonClass =
  "cursor-pointer rounded-[9px] border border-ghost-border bg-surface px-3.5 py-1.5 text-[12px] font-medium text-ink disabled:cursor-default disabled:opacity-50";

/** Filled button on the done card. */
export const okButtonClass =
  "cursor-pointer rounded-[10px] bg-ok px-4 py-2 text-[12.5px] font-semibold text-white";

/** Label above a section. */
export const sectionLabelClass = "text-[12.5px] font-bold text-muted";

/** Secondary line under a title. */
export const labelClass = "text-[11.5px] text-muted";

/** Small faint caption. */
export const faintLabelClass = "text-[11px] text-faint";

const pillClass = "rounded-full px-2.5 py-[3px] text-[11px] font-semibold";

/** Neutral pill (category chips). */
export const neutralPillClass = `${pillClass} bg-neutral-bg text-muted`;

/** Accent pill (highlighted chips). */
export const accentPillClass = `${pillClass} bg-accent-bg text-accent`;

/** Pill for anything on the public ledger. */
export const publicPillClass = `${pillClass} bg-public-bg text-public`;

/** Pill for anything in private state. */
export const privatePillClass = `${pillClass} bg-private-bg text-private`;

/** Pill for a step in progress. */
export const warnPillClass = `${pillClass} bg-warn-bg text-warn`;

/**
 * やり終えたことを示すバッジ
 */
export const okPillClass = `${pillClass} bg-ok-bg text-ok`;

/** Informational note box. */
export const noteClass =
  "rounded-[10px] bg-note-bg px-3 py-2 text-[11px] leading-relaxed text-note";

/** Error box. */
export const dangerBoxClass =
  "rounded-[10px] bg-danger-bg px-4 py-2.5 text-[12.5px] font-semibold text-danger";

/**
 * 予定の行の先頭に出すアイコン (手配済みかどうかで分ける)
 */
export const eventIcon = {
  unarranged: "\u{1F4C5}",
  arranged: "\u{1F9F3}",
} as const satisfies Record<"unarranged" | "arranged", string>;

/** Icon and circle color for a trip item, by transport mode or lodging. */
export const vendorMark = {
  rail: { icon: "\u{1F684}", circleClass: "bg-rail" },
  air: { icon: "✈", circleClass: "bg-air" },
  lodging: { icon: "\u{1F3E8}", circleClass: "bg-hotel" },
} as const satisfies Record<
  "rail" | "air" | "lodging",
  { icon: string; circleClass: string }
>;
