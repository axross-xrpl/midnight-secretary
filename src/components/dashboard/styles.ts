/**
 * Shared Tailwind class strings for the dashboard so every card and button
 * reads as one system.
 */
export const cardClass =
  "rounded-2xl border border-black/8 bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950";

/**
 * Filled call-to-action button, matching the sign-in button in the nav bar.
 */
export const primaryButtonClass =
  "rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200";

/**
 * Outlined secondary button.
 */
export const secondaryButtonClass =
  "rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-zinc-900";

/**
 * Small uppercase label above a value.
 */
export const labelClass =
  "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

/**
 * Left accent for anything that lives in private state (violet).
 */
export const privateAccentClass = "border-l-4 border-l-violet-500";

/**
 * Left accent for anything on the public ledger (amber).
 */
export const publicAccentClass = "border-l-4 border-l-amber-500";

/**
 * Number format options for a display amount. Structurally compatible with
 * next-intl's `NumberFormatOptions`.
 */
export type MoneyFormatOptions = {
  style: "currency";
  currency: string;
  maximumFractionDigits: 0;
};

/**
 * Options for a display amount in the given currency.
 * JPY has no minor unit, so fractions are never shown.
 */
export const moneyFormatOptions = (currency: string): MoneyFormatOptions => {
  return { style: "currency", currency, maximumFractionDigits: 0 };
};
