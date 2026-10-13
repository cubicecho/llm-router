import type { TokenUsage } from '@llm-router/shared';
import { formatCount, formatDate, joinStats } from './format.ts';

/** Token counts are shortened to one decimal place: 1.3M, 340.1K. */
const COMPACT_TOKENS = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Shortens a token count for a line with other facts on it.
 *
 * @param count - The number of tokens.
 * @returns The count as `340`, `1.2K`, `1.3M`.
 */
export function formatTokens(count: number): string {
  return COMPACT_TOKENS.format(count);
}

/**
 * Words request and token counts as one line.
 *
 * @param usage - The counts.
 * @returns The line, e.g. `42 requests · 1.3M in · 340.1K out`.
 */
export function usageLine(usage: TokenUsage): string {
  return joinStats(
    formatCount(usage.requests, 'request'),
    `${formatTokens(usage.inputTokens)} in`,
    `${formatTokens(usage.outputTokens)} out`,
  );
}

/**
 * Words token counts in full, for a tooltip behind the shortened line.
 *
 * @param usage - The counts.
 * @returns The sentence, e.g. `1,250,300 tokens in, 340,120 tokens out`.
 */
export function exactTokens(usage: TokenUsage): string {
  return `${formatCount(usage.inputTokens, 'token')} in, ${formatCount(usage.outputTokens, 'token')} out`;
}

/** Appended to a bare `YYYY-MM-DD` so it is read as a local date and not as UTC. */
const LOCAL_MIDNIGHT = 'T00:00:00';

/**
 * Words a usage day for a row.
 *
 * @param day - The day as the router names it, `YYYY-MM-DD`.
 * @returns The date in the reader's locale, e.g. `Oct 9, 2026`. Read as a local date, since a bare `YYYY-MM-DD` is
 * parsed as UTC and would show as the day before west of Greenwich.
 */
export function dayLabel(day: string): string {
  return formatDate(`${day}${LOCAL_MIDNIGHT}`);
}
