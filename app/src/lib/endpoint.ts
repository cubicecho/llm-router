/** Path of the OpenAI base URL that serves every enabled provider. */
export const GLOBAL_ENDPOINT_PATH = '/v1';

/**
 * Makes an endpoint path absolute on this router, as a client needs it.
 *
 * @param path - Path starting with `/`.
 * @returns The path prefixed with the page's origin.
 */
export function endpointUrl(path: string): string {
  return `${window.location.origin}${path}`;
}
