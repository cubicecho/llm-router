/**
 * Settles an optional text field of a `PATCH`.
 *
 * @param update - The field as the request sent it.
 * @param stored - The field as it is stored.
 * @returns The stored value when the request left the field out, nothing when it sent `null` or an empty text, and
 * the sent text otherwise.
 */
export function keptOrCleared(update: string | null | undefined, stored: string | undefined): string | undefined {
  const isLeftOut = update === undefined;
  if (isLeftOut) {
    return stored;
  }
  return update || undefined;
}
