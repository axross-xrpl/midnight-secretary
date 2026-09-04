const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns the ISO 8601 instant `days` days after `iso`.
 */
export const addDays = (iso: string, days: number): string => {
  return new Date(Date.parse(iso) + days * MILLIS_PER_DAY).toISOString();
};

/**
 * Returns the ISO 8601 instant on the same UTC day as `iso` at `hour`:00 UTC.
 */
export const atHour = (iso: string, hour: number): string => {
  const date = new Date(iso);

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      0,
      0,
      0,
    ),
  ).toISOString();
};

/**
 * True when `now` is at or after `deadline` (both ISO 8601 instants).
 */
export const isPast = (deadline: string, now: string): boolean => {
  return Date.parse(now) >= Date.parse(deadline);
};
