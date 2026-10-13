import {
  apiErrorSchema,
  type CreateProviderRequest,
  type CreateWorkspaceRequest,
  type EditableSettings,
  type ErrorCode,
  editableSettingsSchema,
  HttpStatus,
  type ModelsResponse,
  modelsResponseSchema,
  type ProviderStatus,
  providerStatusSchema,
  type ReloadResponse,
  type RouterStatus,
  reloadResponseSchema,
  routerStatusSchema,
  type UpdateProviderRequest,
  type UpdateSettingsRequest,
  type UpdateWorkspaceRequest,
  type UsageResponse,
  usageResponseSchema,
  type WorkspaceStatus,
  workspaceStatusSchema,
} from '@llm-router/shared';
import { z } from 'zod';
import { getToken, requireAuth } from './auth.ts';

/** The content type of every body the app sends and the router answers with. */
export const JSON_CONTENT_TYPE = 'application/json';
/** The method of a request that names none. */
const DEFAULT_METHOD = 'GET';
/** Where the providers are listed and added. */
const PROVIDERS_PATH = '/api/providers';
/** Where the workspaces are listed and created. */
const WORKSPACES_PATH = '/api/workspaces';
/** Makes the router ask the provider again and not answer a model listing from its cache. */
const REFRESH_QUERY = '?refresh=true';

/**
 * Builds the path of one provider's routes.
 *
 * @param name - The provider's name.
 * @returns The path, the name escaped.
 */
function providerPath(name: string): string {
  return `${PROVIDERS_PATH}/${encodeURIComponent(name)}`;
}

/**
 * Builds the path of one workspace's routes.
 *
 * @param slug - The workspace's slug.
 * @returns The path, the slug escaped.
 */
function workspacePath(slug: string): string {
  return `${WORKSPACES_PATH}/${encodeURIComponent(slug)}`;
}

/** A non-2xx answer from the API, carrying the HTTP status and the server's `{ error, code, detail? }` envelope. */
export class ApiRequestError extends Error {
  /** HTTP status of the answer. */
  readonly status: number;
  /** Undefined when the answer was not an envelope (a proxy's own error page). */
  readonly code?: ErrorCode;
  /** The envelope's longer explanation, when the server sent one. */
  readonly detail?: string;

  /**
   * Builds the error from a failed answer.
   *
   * @param status - HTTP status of the answer.
   * @param message - The envelope's `error`, or the status text when there was no envelope.
   * @param [envelope] - The envelope's `code` and `detail`; omit when the answer was not an envelope.
   */
  constructor(status: number, message: string, envelope: { code?: ErrorCode; detail?: string } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = envelope.code;
    this.detail = envelope.detail;
  }
}

/** What a request sends besides its path. */
interface RequestOptions {
  /**
   * HTTP method.
   *
   * @defaultValue `'GET'`
   */
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Sent as JSON; `undefined` sends no body and no Content-Type. */
  body?: unknown;
}

/**
 * Sends a request and hands back the response once it is known to have succeeded.
 *
 * @param path - Same-origin path, query included.
 * @param [options] - Method and JSON body.
 * @returns The 2xx response, body unread. Throws `ApiRequestError` on any other status.
 *
 * @remarks
 * Adds the stored bearer token when there is one. A 401 raises the needs-auth flag before it throws.
 */
async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getToken();
  const hasToken = token !== null && token !== '';
  if (hasToken) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = JSON_CONTENT_TYPE;
  }

  const response = await fetch(path, {
    method: options.method ?? DEFAULT_METHOD,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === HttpStatus.Unauthorized) {
    requireAuth();
  }

  const requestFailed = response.ok === false;
  if (requestFailed) {
    const envelope = apiErrorSchema.safeParse(await response.json().catch(() => undefined));
    const statusMessage = response.statusText || `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, envelope.data?.error || statusMessage, {
      code: envelope.data?.code,
      detail: envelope.data?.detail,
    });
  }
  return response;
}

/**
 * Sends a request and reads its JSON answer through the shared schema for that route.
 *
 * @typeParam Schema - The zod schema the answer must match.
 * @param path - Same-origin path, query included.
 * @param schema - Parses the answer.
 * @param [options] - Method and JSON body.
 * @returns The parsed answer. Throws `ApiRequestError` on a non-2xx status, an `Error` when the answer does not match.
 *
 * @remarks
 * A server and an app that disagree about a shape fail here and not somewhere in a component.
 */
async function request<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  const response = await send(path, options);
  const unexpectedResponse = (cause: unknown) =>
    new Error(`Unexpected response from ${options.method ?? DEFAULT_METHOD} ${path}`, { cause });
  // A 2xx that is not JSON, such as a proxy's HTML page, is the same failure as one of the wrong shape.
  const body: unknown = await response.json().catch((cause: unknown) => {
    throw unexpectedResponse(cause);
  });
  const result = schema.safeParse(body);
  if (result.success === false) {
    throw unexpectedResponse(result.error);
  }
  return result.data;
}

/**
 * Sends a request whose answer has no body.
 *
 * @param path - Same-origin path, query included.
 * @param [options] - Method and JSON body.
 *
 * @remarks
 * Throws `ApiRequestError` on a non-2xx status.
 */
async function requestNoContent(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}

/**
 * Reads the router's own status from `GET /api/status`.
 *
 * @returns Version, uptime, provider and workspace counts, and whether auth is on.
 */
export function getStatus(): Promise<RouterStatus> {
  return request('/api/status', routerStatusSchema);
}

/**
 * Reads the editable settings from `GET /api/settings`.
 *
 * @returns The settings the UI may change.
 */
export function getSettings(): Promise<EditableSettings> {
  return request('/api/settings', editableSettingsSchema);
}

/**
 * Changes settings with `PATCH /api/settings`.
 *
 * @param body - Only the settings to change.
 * @returns The settings after the change.
 */
export function updateSettings(body: UpdateSettingsRequest): Promise<EditableSettings> {
  return request('/api/settings', editableSettingsSchema, { method: 'PATCH', body });
}

/**
 * Makes the router re-read its config files with `POST /api/reload`.
 *
 * @returns How many providers and workspaces it now has.
 */
export function reloadConfig(): Promise<ReloadResponse> {
  return request('/api/reload', reloadResponseSchema, { method: 'POST' });
}

/**
 * Lists every provider from `GET /api/providers`.
 *
 * @returns Each provider's config, without its key.
 */
export function listProviders(): Promise<ProviderStatus[]> {
  return request(PROVIDERS_PATH, z.array(providerStatusSchema));
}

/**
 * Reads one provider from `GET /api/providers/:name`.
 *
 * @param name - The provider's name.
 * @returns Its config, without its key.
 */
export function getProvider(name: string): Promise<ProviderStatus> {
  return request(providerPath(name), providerStatusSchema);
}

/**
 * Adds a provider with `POST /api/providers`.
 *
 * @param body - The provider to add.
 * @returns The provider as saved.
 */
export function createProvider(body: CreateProviderRequest): Promise<ProviderStatus> {
  return request(PROVIDERS_PATH, providerStatusSchema, { method: 'POST', body });
}

/**
 * Changes a provider with `PATCH /api/providers/:name`.
 *
 * @param name - The provider's name.
 * @param body - Only the fields to change; a key left out is kept.
 * @returns The provider after the change.
 */
export function updateProvider(name: string, body: UpdateProviderRequest): Promise<ProviderStatus> {
  return request(providerPath(name), providerStatusSchema, { method: 'PATCH', body });
}

/**
 * Removes a provider with `DELETE /api/providers/:name`.
 *
 * @param name - The provider's name.
 */
export function deleteProvider(name: string): Promise<void> {
  return requestNoContent(providerPath(name), { method: 'DELETE' });
}

/**
 * Lists a provider's models from `GET /api/providers/:name/models`.
 *
 * @param name - The provider's name.
 * @param [options.refresh] - Ask the provider again, past the router's cached listing.
 * @returns The models, or the provider under `skipped` when it could not be listed.
 */
export function getProviderModels(name: string, options: { refresh?: boolean } = {}): Promise<ModelsResponse> {
  const suffix = options.refresh === true ? REFRESH_QUERY : '';
  return request(`${providerPath(name)}/models${suffix}`, modelsResponseSchema);
}

/**
 * Lists every workspace from `GET /api/workspaces`.
 *
 * @returns Each workspace's config and endpoint path.
 */
export function listWorkspaces(): Promise<WorkspaceStatus[]> {
  return request(WORKSPACES_PATH, z.array(workspaceStatusSchema));
}

/**
 * Reads one workspace from `GET /api/workspaces/:slug`.
 *
 * @param slug - The workspace's slug.
 * @returns Its config and endpoint path.
 */
export function getWorkspace(slug: string): Promise<WorkspaceStatus> {
  return request(workspacePath(slug), workspaceStatusSchema);
}

/**
 * Creates a workspace with `POST /api/workspaces`.
 *
 * @param body - The workspace to create.
 * @returns The workspace as saved.
 */
export function createWorkspace(body: CreateWorkspaceRequest): Promise<WorkspaceStatus> {
  return request(WORKSPACES_PATH, workspaceStatusSchema, { method: 'POST', body });
}

/**
 * Changes a workspace with `PATCH /api/workspaces/:slug`.
 *
 * @param slug - The workspace's slug.
 * @param body - Only the fields to change.
 * @returns The workspace after the change.
 */
export function updateWorkspace(slug: string, body: UpdateWorkspaceRequest): Promise<WorkspaceStatus> {
  return request(workspacePath(slug), workspaceStatusSchema, { method: 'PATCH', body });
}

/**
 * Deletes a workspace with `DELETE /api/workspaces/:slug`.
 *
 * @param slug - The workspace's slug.
 */
export function deleteWorkspace(slug: string): Promise<void> {
  return requestNoContent(workspacePath(slug), { method: 'DELETE' });
}

/**
 * Lists the models a workspace serves from `GET /api/workspaces/:slug/models`.
 *
 * @param slug - The workspace's slug.
 * @returns The models of its enabled members, and the members that could not be listed.
 */
export function getWorkspaceModels(slug: string): Promise<ModelsResponse> {
  return request(`${workspacePath(slug)}/models`, modelsResponseSchema);
}

/**
 * Reads the request and token counts from `GET /api/usage`.
 *
 * @returns Every provider that has been called and every workspace that has been called through, each with its
 * totals, its models and its recent days.
 */
export function getUsage(): Promise<UsageResponse> {
  return request('/api/usage', usageResponseSchema);
}

/**
 * Starts every request and token count over with `DELETE /api/usage`.
 */
export function resetUsage(): Promise<void> {
  return requestNoContent('/api/usage', { method: 'DELETE' });
}
