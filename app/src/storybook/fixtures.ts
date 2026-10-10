import {
  type EditableSettings,
  editableSettingsSchema,
  type ModelsResponse,
  modelsResponseSchema,
  type ProviderStatus,
  providerStatusSchema,
  type ReloadResponse,
  type RouterStatus,
  reloadResponseSchema,
  routerStatusSchema,
  type WorkspaceStatus,
  workspaceStatusSchema,
} from '@llm-router/shared';
import type { ApiRoutes } from './mock-api.ts';

// Every fixture is read through the shared schema for its shape, so a story's server
// cannot answer with something the real one would not.

/**
 * Builds a local provider that needs no key.
 *
 * @param [overrides] - Any part of the provider to replace.
 * @returns The provider, parsed through the shared schema.
 */
export function localProvider(overrides: Partial<ProviderStatus> = {}): ProviderStatus {
  return providerStatusSchema.parse({
    name: 'ollama',
    displayName: 'Ollama',
    description: 'Models on the workstation.',
    enabled: true,
    baseUrl: 'http://localhost:11434/v1',
    headers: {},
    apiKeySet: false,
    ...overrides,
  });
}

/**
 * Builds a hosted provider with a stored key and one extra header.
 *
 * @param [overrides] - Any part of the provider to replace.
 * @returns The provider, parsed through the shared schema.
 */
export function hostedProvider(overrides: Partial<ProviderStatus> = {}): ProviderStatus {
  return providerStatusSchema.parse({
    name: 'openrouter',
    enabled: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: { 'X-Title': 'llm-router' },
    apiKeySet: true,
    ...overrides,
  });
}

/**
 * Builds a model listing.
 *
 * @param provider - The provider every model belongs to.
 * @param upstreamIds - The models' ids at the provider.
 * @param [skipped] - The providers that could not be listed.
 * @returns The listing, parsed through the shared schema.
 */
export function models(
  provider: string,
  upstreamIds: string[],
  skipped: ModelsResponse['skipped'] = [],
): ModelsResponse {
  return modelsResponseSchema.parse({
    models: upstreamIds.map((upstreamId) => ({ id: `${provider}/${upstreamId}`, provider, upstreamId })),
    skipped,
  });
}

/** The models the local provider lists. */
export const LOCAL_MODELS = models('ollama', ['qwen3:32b', 'nomic-embed-text']);

/** The models the hosted provider lists. */
export const HOSTED_MODELS = models('openrouter', ['anthropic/claude-opus-5-5', 'openai/gpt-5']);

/**
 * Builds a workspace with both fixture providers, the hosted one limited to one model.
 *
 * @param [overrides] - Any part of the workspace to replace.
 * @returns The workspace, parsed through the shared schema.
 */
export function workspace(overrides: Partial<WorkspaceStatus> = {}): WorkspaceStatus {
  return workspaceStatusSchema.parse({
    name: 'Research',
    slug: 'research',
    path: '/w/research/v1',
    enabled: true,
    description: 'Models for the research agents.',
    members: {
      ollama: { enabled: true },
      openrouter: { enabled: true, models: ['anthropic/claude-opus-5-5'] },
    },
    ...overrides,
  });
}

/** The models the fixture workspace serves. */
export const WORKSPACE_MODELS = modelsResponseSchema.parse({
  models: [...LOCAL_MODELS.models, ...models('openrouter', ['anthropic/claude-opus-5-5']).models],
  skipped: [],
});

/**
 * Builds the router's status.
 *
 * @param [overrides] - Any part of the status to replace.
 * @returns The status, parsed through the shared schema.
 */
export function routerStatus(overrides: Partial<RouterStatus> = {}): RouterStatus {
  return routerStatusSchema.parse({
    version: '0.1.0',
    uptimeSeconds: 3725,
    providerCount: 2,
    workspaceCount: 1,
    authEnabled: true,
    ...overrides,
  });
}

/**
 * Builds the editable settings.
 *
 * @param [overrides] - Any setting to replace.
 * @returns The settings, parsed through the shared schema.
 */
export function settings(overrides: Partial<EditableSettings> = {}): EditableSettings {
  return editableSettingsSchema.parse({
    responseTimeoutMs: 600_000,
    authEnabled: true,
    allowedOrigins: [],
    ...overrides,
  });
}

/** What a reload answers. */
export const RELOADED: ReloadResponse = reloadResponseSchema.parse({
  reloaded: true,
  providerCount: 2,
  workspaceCount: 1,
});

/**
 * Builds the answers of a server with two providers and one workspace, for a story about a page.
 *
 * @returns The routes every page reads; spread it and replace a key to change one answer.
 */
export function appRoutes(): ApiRoutes {
  return {
    'GET /api/status': routerStatus(),
    'GET /api/settings': settings(),
    'GET /api/providers': [localProvider(), hostedProvider()],
    'GET /api/providers/ollama': localProvider(),
    'GET /api/providers/openrouter': hostedProvider(),
    'GET /api/providers/ollama/models': LOCAL_MODELS,
    'GET /api/providers/openrouter/models': HOSTED_MODELS,
    'GET /api/workspaces': [workspace()],
    'GET /api/workspaces/research': workspace(),
    'GET /api/workspaces/research/models': WORKSPACE_MODELS,
  };
}
