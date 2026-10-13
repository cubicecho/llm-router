/** Path of the OpenAI base URL that serves every enabled provider. */
export const GLOBAL_ENDPOINT_PATH = '/v1';

/** The path segment every workspace's base URL starts with. */
export const WORKSPACE_PATH_PREFIX = '/w';

/**
 * Names the path of a workspace's OpenAI base URL.
 *
 * @param slug - The workspace's slug, or a route parameter such as `:slug`.
 * @returns `/w/<slug>/v1`.
 */
export function workspaceEndpointPath(slug: string): string {
  return `${WORKSPACE_PATH_PREFIX}/${slug}${GLOBAL_ENDPOINT_PATH}`;
}
