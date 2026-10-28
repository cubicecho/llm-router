import type {
  CreatePoolRequest,
  CreateProviderRequest,
  CreateWorkspaceRequest,
  EditableSettings,
  ModelsResponse,
  PoolLoad,
  PoolStatus,
  ProviderStatus,
  ReloadResponse,
  RouterStatus,
  UpdatePoolRequest,
  UpdateProviderRequest,
  UpdateSettingsRequest,
  UpdateWorkspaceRequest,
  UsageResponse,
  WorkspaceStatus,
} from '@llm-router/shared';
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as api from './api.ts';
import { POLLING_DEFAULTS } from './defaults.ts';

/** The last segment of a workspace's model-list key, which tells those queries from the workspace's own. */
const WORKSPACE_MODELS_SEGMENT = 'models';

/** Every query key the app uses; a key that starts with another is invalidated along with it. */
export const queryKeys = {
  status: ['status'] as const,
  settings: ['settings'] as const,
  providers: ['providers'] as const,
  provider: (name: string) => ['providers', name] as const,
  providerModels: (name: string) => ['providers', name, 'models'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (slug: string) => ['workspaces', slug] as const,
  workspaceModels: (slug: string) => ['workspaces', slug, WORKSPACE_MODELS_SEGMENT] as const,
  pools: ['pools'] as const,
  pool: (name: string) => ['pools', name] as const,
  poolLoad: (name: string) => ['pools', name, 'load'] as const,
  usage: ['usage'] as const,
};

/** What a query hook hands back: `data` is the router's answer once it has one. */
type Query<Data> = UseQueryResult<Data, Error>;

/** What a mutation hook hands back: `mutate` takes the variables and settles with the router's answer. */
type Mutation<Data, Variables = void> = UseMutationResult<Data, Error, Variables>;

/** A model listing calls the providers themselves: allow it to be slow, reuse it for a while, never auto-retry. */
const MODEL_LISTING = { retry: false, staleTime: POLLING_DEFAULTS.modelsStaleMs } as const;

/**
 * Reads the router's status and keeps it polled.
 *
 * @returns The query; `data` is the router status.
 */
export function useRouterStatus(): Query<RouterStatus> {
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
export function useUsage(): Query<UsageResponse> {
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
export function useSettings(): Query<EditableSettings> {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings });
}

/**
 * Lists every provider.
 *
 * @returns The query; `data` is each provider's config without its key.
 */
export function useProviders(): Query<ProviderStatus[]> {
  return useQuery({ queryKey: queryKeys.providers, queryFn: api.listProviders });
}

/**
 * Reads one provider.
 *
 * @param name - The provider's name.
 * @returns The query; `data` is the provider's config without its key.
 */
export function useProvider(name: string): Query<ProviderStatus> {
  return useQuery({ queryKey: queryKeys.provider(name), queryFn: () => api.getProvider(name) });
}

/**
 * Lists a provider's models.
 *
 * @param name - The provider's name.
 * @param [options.enabled] - False holds the request back, for a row that may never be opened.
 * @returns The query; `data` is the models, or the provider under `skipped`. Never retried.
 */
export function useProviderModels(name: string, options: { enabled?: boolean } = {}): Query<ModelsResponse> {
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
export function useWorkspaces(): Query<WorkspaceStatus[]> {
  return useQuery({ queryKey: queryKeys.workspaces, queryFn: api.listWorkspaces });
}

/**
 * Reads one workspace.
 *
 * @param slug - The workspace's slug.
 * @returns The query; `data` is the workspace's config and endpoint path.
 */
export function useWorkspace(slug: string): Query<WorkspaceStatus> {
  return useQuery({ queryKey: queryKeys.workspace(slug), queryFn: () => api.getWorkspace(slug) });
}

/**
 * Lists the models a workspace serves.
 *
 * @param slug - The workspace's slug.
 * @returns The query; `data` is the merged models and the members that could not be listed. Never retried.
 */
export function useWorkspaceModels(slug: string): Query<ModelsResponse> {
  return useQuery({
    ...MODEL_LISTING,
    queryKey: queryKeys.workspaceModels(slug),
    queryFn: () => api.getWorkspaceModels(slug),
  });
}

/**
 * Lists every pool.
 *
 * @returns The query; `data` is each pool's config.
 */
export function usePools(): Query<PoolStatus[]> {
  return useQuery({ queryKey: queryKeys.pools, queryFn: api.listPools });
}

/**
 * Reads one pool.
 *
 * @param name - The pool's name.
 * @returns The query; `data` is the pool's config.
 */
export function usePool(name: string): Query<PoolStatus> {
  return useQuery({ queryKey: queryKeys.pool(name), queryFn: () => api.getPool(name) });
}

/**
 * Reads each target's live load and keeps it polled.
 *
 * @param name - The pool's name.
 * @returns The query; `data.targets` is each target with its requests in flight.
 */
export function usePoolLoad(name: string): Query<PoolLoad> {
  return useQuery({
    queryKey: queryKeys.poolLoad(name),
    queryFn: () => api.getPoolLoad(name),
    refetchInterval: POLLING_DEFAULTS.poolLoadMs,
  });
}

/**
 * Builds a function that marks queries stale.
 *
 * @returns The function; takes the keys to invalidate, each with everything under it.
 */
function useInvalidate(): (...keys: readonly (readonly string[])[]) => void {
  const queryClient = useQueryClient();
  return (...keys: readonly (readonly string[])[]) => {
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

/**
 * What a change to a provider makes stale: the providers and their models, the router status, the workspaces,
 * whose model lists are built from their members' and which lose a deleted provider, and the pools, which lose its
 * targets.
 */
const PROVIDER_CHANGE_KEYS = [queryKeys.providers, queryKeys.status, queryKeys.workspaces, queryKeys.pools] as const;

/** What a change to a workspace makes stale: the workspaces, their model lists, and the router status. */
const WORKSPACE_CHANGE_KEYS = [queryKeys.workspaces, queryKeys.status] as const;

/** What a change to a pool makes stale: the pools and their load, and the workspaces, which lose a deleted pool. */
const POOL_CHANGE_KEYS = [queryKeys.pools, queryKeys.workspaces] as const;

/**
 * Adds a provider.
 *
 * @returns The mutation; takes the provider to add, yields it as saved, and invalidates everything a provider
 * change makes stale.
 */
export function useCreateProvider(): Mutation<ProviderStatus, CreateProviderRequest> {
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
export function useUpdateProvider(): Mutation<ProviderStatus, UpdateProviderRequest & { name: string }> {
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
export function useDeleteProvider(): Mutation<void, string> {
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
 * @returns The mutation; takes the provider's name, yields the fresh listing, keeps it as that provider's models
 * query data, and invalidates every workspace's model list, which is built from it.
 */
export function useRefreshProviderModels(): Mutation<ModelsResponse, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.getProviderModels(name, { refresh: true }),
    onSuccess: (models, name) => {
      queryClient.setQueryData(queryKeys.providerModels(name), models);
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces,
        predicate: (query) => query.queryKey.at(-1) === WORKSPACE_MODELS_SEGMENT,
      });
    },
  });
}

/**
 * Creates a workspace.
 *
 * @returns The mutation; takes the workspace to create, yields it as saved, and invalidates everything a
 * workspace change makes stale.
 */
export function useCreateWorkspace(): Mutation<WorkspaceStatus, CreateWorkspaceRequest> {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateWorkspaceRequest) => api.createWorkspace(body),
    onSuccess: () => invalidate(...WORKSPACE_CHANGE_KEYS),
  });
}

/**
 * Changes a workspace.
 *
 * @returns The mutation; takes the workspace's `slug` plus the fields to change, yields the workspace, keeps it as
 * that workspace's query data, and invalidates everything a workspace change makes stale.
 */
export function useUpdateWorkspace(): Mutation<WorkspaceStatus, UpdateWorkspaceRequest & { slug: string }> {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, ...body }: UpdateWorkspaceRequest & { slug: string }) => api.updateWorkspace(slug, body),
    onSuccess: (saved) => {
      // Held at once, not after the refetch: the next change is built on the workspace on screen.
      queryClient.setQueryData(queryKeys.workspace(saved.slug), saved);
      // A rename moves the workspace's counts to its new slug.
      invalidate(...WORKSPACE_CHANGE_KEYS, queryKeys.usage);
    },
  });
}

/**
 * Deletes a workspace.
 *
 * @returns The mutation; takes the workspace's slug and invalidates everything a workspace change makes stale.
 */
export function useDeleteWorkspace(): Mutation<void, string> {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (slug: string) => api.deleteWorkspace(slug),
    onSuccess: () => invalidate(...WORKSPACE_CHANGE_KEYS, queryKeys.usage),
  });
}

/**
 * Creates a pool.
 *
 * @returns The mutation; takes the pool to create, yields it as saved, and invalidates everything a pool change
 * makes stale.
 */
export function useCreatePool(): Mutation<PoolStatus, CreatePoolRequest> {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreatePoolRequest) => api.createPool(body),
    onSuccess: () => invalidate(...POOL_CHANGE_KEYS),
  });
}

/**
 * Changes a pool.
 *
 * @returns The mutation; takes the pool's `name` plus the fields to change, yields the pool, keeps it as that pool's
 * query data, and invalidates everything a pool change makes stale.
 */
export function useUpdatePool(): Mutation<PoolStatus, UpdatePoolRequest & { name: string }> {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...body }: UpdatePoolRequest & { name: string }) => api.updatePool(name, body),
    onSuccess: (saved) => {
      // Held at once, not after the refetch: the next change to the targets is built on the pool on screen.
      queryClient.setQueryData(queryKeys.pool(saved.name), saved);
      invalidate(...POOL_CHANGE_KEYS);
    },
  });
}

/**
 * Deletes a pool.
 *
 * @returns The mutation; takes the pool's name and invalidates everything a pool change makes stale.
 */
export function useDeletePool(): Mutation<void, string> {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.deletePool(name),
    onSuccess: () => invalidate(...POOL_CHANGE_KEYS),
  });
}

/**
 * Changes router settings.
 *
 * @returns The mutation; takes the settings to change, yields them as saved, and invalidates the settings and
 * the router status.
 */
export function useUpdateSettings(): Mutation<EditableSettings, UpdateSettingsRequest> {
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
export function useReloadConfig(): Mutation<ReloadResponse> {
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
export function useResetUsage(): Mutation<void> {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.resetUsage(),
    onSuccess: () => invalidate(queryKeys.usage),
  });
}
