/**
 * Makes an endpoint path absolute on this router, as a client needs it.
 *
 * @param path - Path starting with `/`.
 * @returns The path prefixed with the page's origin.
 */
export function endpointUrl(path: string): string {
  return `${window.location.origin}${path}`;
}
