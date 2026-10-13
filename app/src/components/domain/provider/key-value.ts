import { nonBlankLines } from '@/lib/lines';

/**
 * Writes a record as editable text.
 *
 * @param [record] - The record; undefined counts as empty.
 * @returns One `Name: value` line per entry.
 */
export function recordToLines(record: Record<string, string> = {}): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

/**
 * Parses `Name: value` lines into a record.
 *
 * @param text - One pair per line, split at the first `:`; name and value are trimmed.
 * @returns The record; a line with no `:` or no name is skipped, and a repeated name keeps its last value.
 */
export function linesToRecord(text: string): Record<string, string> {
  const record: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const hasName = key !== '';
    if (hasName) {
      record[key] = line.slice(separator + 1).trim();
    }
  }
  return record;
}

/**
 * Finds the lines `linesToRecord` would drop.
 *
 * @param text - One pair per line.
 * @returns The non-blank lines that have no `:` or no name before it.
 */
export function malformedLines(text: string): string[] {
  return nonBlankLines(text).filter((line) => line.indexOf(':') < 1);
}
