import type { ProviderConfig, WorkspaceConfig } from '@llm-router/shared';
import type { ConfigStore } from '../config/store.ts';

/** One provider an endpoint routes to. */
export interface ScopeMember {
  provider: ProviderConfig;
  /** The provider's own model ids the endpoint exposes; undefined exposes all of them. */
  allowedModels?: readonly string[];
}

/** The providers one endpoint serves: every enabled one, or a workspace's. */
export interface EndpointScope {
  /** Names the endpoint in logs. */
  label: string;
  /** The workspace's slug; left out for the global endpoint. */
  workspace?: string;
  members: ScopeMember[];
}

/**
 * Builds the scope of the global /v1 endpoint.
 *
 * @param store - Read for the providers.
 * @returns Every enabled provider, with no model filter.
 */
export function globalScope(store: ConfigStore): EndpointScope {
  const members = store
    .getProviders()
    .filter((provider) => provider.enabled)
    .map((provider) => ({ provider }));
  return { label: 'the global endpoint', members };
}

/**
 * Builds the scope of a workspace's /w/<slug>/v1 endpoint.
 *
 * @param workspace - The workspace.
 * @param store - Read for the providers its members name.
 * @returns The members that are enabled and name an enabled provider, each with its model allowlist.
 */
export function workspaceScope(workspace: WorkspaceConfig, store: ConfigStore): EndpointScope {
  const members: ScopeMember[] = [];
  for (const [name, member] of Object.entries(workspace.members)) {
    const provider = store.getProvider(name);
    if (provider?.enabled && member.enabled) {
      members.push({ provider, allowedModels: member.models });
    }
  }
  return { label: `workspace "${workspace.slug}"`, workspace: workspace.slug, members };
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
