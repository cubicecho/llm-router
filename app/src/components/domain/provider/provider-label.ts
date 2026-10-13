/**
 * Picks what a provider is called on screen.
 *
 * @param provider.name - The provider's name, the prefix of its model ids.
 * @param [provider.displayName] - The friendlier name, when one is set.
 * @returns The display name, or the name when there is none.
 */
export function providerLabel(provider: { name: string; displayName?: string }): string {
  return provider.displayName || provider.name;
}
