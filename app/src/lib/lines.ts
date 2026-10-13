/**
 * Splits a textarea's text into the lines that say something.
 *
 * @param text - Text with one entry per line.
 * @returns The lines, trimmed, without the blank ones.
 */
export function nonBlankLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
