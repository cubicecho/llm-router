/** The width of a month or a day in `YYYY-MM-DD`. */
const TWO_DIGITS = 2;

/**
 * Names the calendar day a moment falls on, in the router's own time zone.
 *
 * @param moment - The moment.
 * @returns The day as `YYYY-MM-DD`, which sorts in date order.
 */
export function localDay(moment: Date): string {
  const month = String(moment.getMonth() + 1).padStart(TWO_DIGITS, '0');
  const date = String(moment.getDate()).padStart(TWO_DIGITS, '0');
  return `${moment.getFullYear()}-${month}-${date}`;
}

/**
 * Names the oldest day that still keeps its own counts.
 *
 * @param today - The current moment.
 * @param detailDays - How many days keep their own counts, today included.
 * @returns That day as `YYYY-MM-DD`.
 */
export function oldestDetailDay(today: Date, detailDays: number): string {
  // The Date constructor carries a day below one into the month before.
  return localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (detailDays - 1)));
}
