import type { PoolConfig, ProviderConfig, WorkspaceConfig } from '@llm-router/shared';
import type { ConfigStore } from '../config/store.ts';
import type { PoolCandidate } from './balancer.ts';

/** One provider an endpoint routes to. */
export interface ScopeMember {
  provider: ProviderConfig;
  /** The provider's own model ids the endpoint exposes; undefined exposes all of them. */
  allowedModels?: readonly string[];
}

/** One pool an endpoint serves, with the targets a request can go to now. */
export interface ScopePool {
  pool: PoolConfig;
  /** The pool's targets whose provider is enabled, in the pool's order. */
  candidates: PoolCandidate[];
}

/** The providers and pools one endpoint serves: every enabled one, or a workspace's. */
export interface EndpointScope {
  /** Names the endpoint in logs. */
  label: string;
  /** The workspace's slug; left out for the global endpoint. */
  workspace?: string;
  members: ScopeMember[];
  pools: ScopePool[];
}

/**
 * Finds the targets of a pool a request can go to.
 *
 * @param pool - The pool.
 * @param store - Read for the targets' providers.
 * @returns The targets whose provider exists and is enabled, in the pool's order.
 */
export function poolCandidates(pool: PoolConfig, store: ConfigStore): PoolCandidate[] {
  return pool.targets.flatMap((target) => {
    const provider = store.getProvider(target.provider);
    return provider?.enabled ? [{ provider, model: target.model }] : [];
  });
}

/**
 * Resolves the pools an endpoint serves.
 *
 * @param pools - The pools, enabled or not.
 * @param store - Read for their targets' providers.
 * @returns The enabled pools, each with its candidates.
 */
function scopePools(pools: readonly PoolConfig[], store: ConfigStore): ScopePool[] {
  return pools.filter((pool) => pool.enabled).map((pool) => ({ pool, candidates: poolCandidates(pool, store) }));
}

/**
 * Builds the scope of the global /v1 endpoint.
 *
 * @param store - Read for the providers.
 * @returns Every enabled provider, with no model filter, and every enabled pool.
 */
export function globalScope(store: ConfigStore): EndpointScope {
  const members = store
    .getProviders()
    .filter((provider) => provider.enabled)
    .map((provider) => ({ provider }));
  return { label: 'the global endpoint', members, pools: scopePools(store.getPools(), store) };
}

/**
 * Builds the scope of a workspace's /w/<slug>/v1 endpoint.
 *
 * @param workspace - The workspace.
 * @param store - Read for the providers its members name and the pools it lists.
 * @returns The members that are enabled and name an enabled provider, each with its model allowlist, and the enabled
 * pools it lists.
 */
export function workspaceScope(workspace: WorkspaceConfig, store: ConfigStore): EndpointScope {
  const members: ScopeMember[] = [];
  for (const [name, member] of Object.entries(workspace.members)) {
    const provider = store.getProvider(name);
    if (provider?.enabled && member.enabled) {
      members.push({ provider, allowedModels: member.models });
    }
  }
  const pools = workspace.pools.flatMap((name) => store.getPool(name) ?? []);
  return {
    label: `workspace "${workspace.slug}"`,
    workspace: workspace.slug,
    members,
    pools: scopePools(pools, store),
  };
}

/**
 * Tells whether a scope member exposes one of its provider's models.
 *
 * @param member - The member.
 * @param upstreamId - The model's id at the provider.
 * @returns True when the member has no allowlist or the id is on it.
 */
export function exposesModel(member: ScopeMember, upstreamId: string): boolean {
  return member.allowedModels === undefined || member.allowedModels.includes(upstreamId);
}
