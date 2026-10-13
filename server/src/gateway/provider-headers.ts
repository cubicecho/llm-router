import type { ProviderConfig } from '@llm-router/shared';

/** The media type of a JSON body. */
export const JSON_CONTENT_TYPE = 'application/json';

/**
 * Builds the headers every request to a provider carries.
 *
 * @param provider - The provider.
 * @param [defaults] - Headers of this request, with lower-cased names.
 * @returns Lower-cased header names: the defaults, `authorization` from the API key when one is stored, then the
 * provider's own headers, which replace any of the same name.
 */
export function providerHeaders(
  provider: ProviderConfig,
  defaults: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { accept: JSON_CONTENT_TYPE, ...defaults };
  if (provider.apiKey) {
    headers.authorization = `Bearer ${provider.apiKey}`;
  }
  for (const [name, value] of Object.entries(provider.headers)) {
    headers[name.toLowerCase()] = value;
  }
  return headers;
}
