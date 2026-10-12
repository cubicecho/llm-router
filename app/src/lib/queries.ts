import type {
  CreateProviderRequest,
  CreateWorkspaceRequest,
  UpdateProviderRequest,
  UpdateSettingsRequest,
  UpdateWorkspaceRequest,
} from '@llm-router/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api.ts';
import { POLLING_DEFAULTS } from './defaults.ts';

/** Every query key the app uses; a key that starts with another is invalidated along with it. */
export const queryKeys = {
  status: ['status'] as const,
  settings: ['settings'] as const,
  providers: ['providers'] as const,
  provider: (name: string) => ['providers', name] as const,
  providerModels: (name: string) => ['providers', name, 'models'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (slug: string) => ['workspaces', slug] as const,
  workspaceModels: (slug: string) => ['workspaces', slug, 'models'] as const,
  usage: ['usage'] as const,
};

/** A model listing calls the providers themselves: allow it to be slow, reuse it for a while, never auto-retry. */
const MODEL_LISTING = { retry: false, staleTime: POLLING_DEFAULTS.modelsStaleMs } as const;

/**
 * Reads the router's status and keeps it polled.
 *
 * @returns The query; `data` is the router status.
 */
export function useRouterStatus() {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: api.getStatus,
    refetchInterval: POLLING_DEFAULTS.statusMs,
  });
}

/**
 * Reads the request and token counts and keeps them polled.
 *
 * @returns The query; `data.providers` holds each provider that has been called, `data.workspaces` each workspace
 * that has been called through.
 */
export function useUsage() {
  return useQuery({
    queryKey: queryKeys.usage,
    queryFn: api.getUsage,
    refetchInterval: POLLING_DEFAULTS.usageMs,
  });
}

/**
 * Reads the settings the UI may change.
 *
 * @returns The query; `data` is the editable settings.
 */
export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings });
}

/**
 * Lists every provider.
 *
 * @returns The query; `data` is each provider's config without its key.
 */
export function useProviders() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: api.listProviders });
}

/**
 * Reads one provider.
 *
 * @param name - The provider's name.
 * @returns The query; `data` is the provider's config without its key.
 */
export function useProvider(name: string) {
  return useQuery({ queryKey: queryKeys.provider(name), queryFn: () => api.getProvider(name) });
}

/**
 * Lists a provider's models.
 *
 * @param name - The provider's name.
 * @param [options.enabled] - False holds the request back, for a row that may never be opened.
 * @returns The query; `data` is the models, or the provider under `skipped`. Never retried.
 */
export function useProviderModels(name: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    ...MODEL_LISTING,
    queryKey: queryKeys.providerModels(name),
    queryFn: () => api.getProviderModels(name),
    enabled: options.enabled ?? true,
  });
}

/**
 * Lists every workspace.
 *
 * @returns The query; `data` is each workspace's config and endpoint path.
 */
export function useWorkspaces() {
  return useQuery({ queryKey: queryKeys.workspaces, queryFn: api.listWorkspaces });
}

/**
 * Reads one workspace.
 *
 * @param slug - The workspace's slug.
 * @returns The query; `data` is the workspace's config and endpoint path.
 */
export function useWorkspace(slug: string) {
  return useQuery({ queryKey: queryKeys.workspace(slug), queryFn: () => api.getWorkspace(slug) });
}

/**
 * Lists the models a workspace serves.
 *
 * @param slug - The workspace's slug.
 * @returns The query; `data` is the merged models and the members that could not be listed. Never retried.
 */
export function useWorkspaceModels(slug: string) {
  return useQuery({
    ...MODEL_LISTING,
    queryKey: queryKeys.workspaceModels(slug),
    queryFn: () => api.getWorkspaceModels(slug),
  });
}

/**
 * Builds a function that marks queries stale.
 *
 * @returns The function; takes the keys to invalidate, each with everything under it.
 */
function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: readonly (readonly string[])[]) => {
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

/**
 * What a change to a provider makes stale: the providers and their models, the router status, and the
 * workspaces, whose model lists are built from their members' and which lose a deleted provider.
 */
const PROVIDER_CHANGE_KEYS = [queryKeys.providers, queryKeys.status, queryKeys.workspaces] as const;

/** What a change to a workspace makes stale: the workspaces, their model lists, and the router status. */
const WORKSPACE_CHANGE_KEYS = [queryKeys.workspaces, queryKeys.status] as const;

/**
 * Adds a provider.
 *
 * @returns The mutation; takes the provider to add, yields it as saved, and invalidates everything a provider
 * change makes stale.
 */
export function useCreateProvider() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateProviderRequest) => api.createProvider(body),
    onSuccess: () => invalidate(...PROVIDER_CHANGE_KEYS),
  });
}

/**
 * Changes a provider.
 *
 * @returns The mutation; takes the provider's `name` plus the fields to change, yields the provider, and
 * invalidates everything a provider change makes stale.
 */
export function useUpdateProvider() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ name, ...body }: UpdateProviderRequest & { name: string }) => api.updateProvider(name, body),
    onSuccess: () => invalidate(...PROVIDER_CHANGE_KEYS),
  });
}

/**
 * Removes a provider.
 *
 * @returns The mutation; takes the provider's name and invalidates everything a provider change makes stale.
 */
export function useDeleteProvider() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.deleteProvider(name),
    // The provider's counts go with it.
    onSuccess: () => invalidate(...PROVIDER_CHANGE_KEYS, queryKeys.usage),
  });
}

/**
 * Asks a provider for its models again, past the router's cached listing.
 *
 * @returns The mutation; takes the provider's name, yields the fresh listing, and invalidates that provider's
 * models and every workspace's.
 */
export function useRefreshProviderModels() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.getProviderModels(name, { refresh: true }),
    onSuccess: (_models, name) => invalidate(queryKeys.providerModels(name), queryKeys.workspaces),
  });
}

/**
 * Creates a workspace.
 *
 * @returns The mutation; takes the workspace to create, yields it as saved, and invalidates everything a
 * workspace change makes stale.
 */
export function useCreateWorkspace() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateWorkspaceRequest) => api.createWorkspace(body),
    onSuccess: () => invalidate(...WORKSPACE_CHANGE_KEYS),
  });
}

/**
 * Changes a workspace.
 *
 * @returns The mutation; takes the workspace's `slug` plus the fields to change, yields the workspace, and
 * invalidates everything a workspace change makes stale.
 */
export function useUpdateWorkspace() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ slug, ...body }: UpdateWorkspaceRequest & { slug: string }) => api.updateWorkspace(slug, body),
    // A rename moves the workspace's counts to its new slug.
    onSuccess: () => invalidate(...WORKSPACE_CHANGE_KEYS, queryKeys.usage),
  });
}

/**
 * Deletes a workspace.
 *
 * @returns The mutation; takes the workspace's slug and invalidates everything a workspace change makes stale.
 */
export function useDeleteWorkspace() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (slug: string) => api.deleteWorkspace(slug),
    onSuccess: () => invalidate(...WORKSPACE_CHANGE_KEYS, queryKeys.usage),
  });
}

/**
 * Changes router settings.
 *
 * @returns The mutation; takes the settings to change, yields them as saved, and invalidates the settings and
 * the router status.
 */
export function useUpdateSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: UpdateSettingsRequest) => api.updateSettings(body),
    onSuccess: () => invalidate(queryKeys.settings, queryKeys.status),
  });
}

/**
 * Makes the router re-read its config files.
 *
 * @returns The mutation; takes nothing, yields the reload result, and invalidates every query in the cache.
 */
export function useReloadConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.reloadConfig(),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/**
 * Starts every request and token count over.
 *
 * @returns The mutation; takes nothing and invalidates the usage.
 */
export function useResetUsage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.resetUsage(),
    onSuccess: () => invalidate(queryKeys.usage),
  });
}
