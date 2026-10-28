import { type PoolConfig, type ProviderConfig, poolConfigSchema, type WorkspaceConfig } from '@llm-router/shared';
import { describe, expect, it } from 'vitest';
import type { ConfigStore } from '../../config/store.ts';
import { exposesModel, globalScope, workspaceScope } from '../endpoint-scope.ts';

const ALPHA: ProviderConfig = { name: 'alpha', enabled: true, baseUrl: 'http://alpha.test/v1', headers: {} };
const BETA: ProviderConfig = { name: 'beta', enabled: true, baseUrl: 'http://beta.test/v1', headers: {} };
const OFF: ProviderConfig = { name: 'off', enabled: false, baseUrl: 'http://off.test/v1', headers: {} };

/** A pool over ALPHA, the disabled provider and one that does not exist. */
const MIXED: PoolConfig = poolConfigSchema.parse({
  name: 'mixed',
  targets: [
    { provider: 'alpha', model: 'small' },
    { provider: 'off', model: 'small' },
    { provider: 'gone', model: 'small' },
  ],
});
const RESTING: PoolConfig = poolConfigSchema.parse({ name: 'resting', enabled: false });

/** The store reads a scope is built from, over fixed lists of providers and pools. */
function storeOf(
  providers: ProviderConfig[],
  pools: PoolConfig[],
): Pick<ConfigStore, 'getProviders' | 'getProvider' | 'getPools' | 'getPool'> {
  return {
    getProviders: () => providers,
    getProvider: (name) => providers.find((provider) => provider.name === name),
    getPools: () => pools,
    getPool: (name) => pools.find((pool) => pool.name === name),
  };
}

const STORE = storeOf([ALPHA, BETA, OFF], [MIXED, RESTING]) as ConfigStore;

describe('globalScope', () => {
  it('holds every enabled provider, with no model filter', () => {
    const scope = globalScope(STORE);
    expect(scope.members).toEqual([{ provider: ALPHA }, { provider: BETA }]);
    expect(scope.workspace).toBeUndefined();
  });

  it('holds every enabled pool, with the targets whose provider is enabled', () => {
    expect(globalScope(STORE).pools).toEqual([{ pool: MIXED, candidates: [{ provider: ALPHA, model: 'small' }] }]);
  });
});

describe('workspaceScope', () => {
  const workspace: WorkspaceConfig = {
    name: 'Team',
    slug: 'team',
    enabled: true,
    members: {
      alpha: { enabled: true, models: ['small'] },
      beta: { enabled: false },
      off: { enabled: true },
      gone: { enabled: true },
    },
    pools: ['mixed', 'resting', 'unknown'],
  };

  it('holds the enabled members that name an enabled provider, each with its allowlist', () => {
    const scope = workspaceScope(workspace, STORE);
    expect(scope.members).toEqual([{ provider: ALPHA, allowedModels: ['small'] }]);
  });

  it('holds the pools it lists that exist and are enabled, whether or not their providers are members', () => {
    expect(workspaceScope({ ...workspace, members: {} }, STORE).pools.map((scopePool) => scopePool.pool)).toEqual([
      MIXED,
    ]);
  });

  it('carries the workspace slug', () => {
    expect(workspaceScope(workspace, STORE).workspace).toBe('team');
  });
});

describe('exposesModel', () => {
  it('exposes every model when the member has no allowlist', () => {
    expect(exposesModel({ provider: ALPHA }, 'anything')).toBe(true);
  });

  it('exposes only the models on the allowlist', () => {
    const member = { provider: ALPHA, allowedModels: ['small'] };
    expect(exposesModel(member, 'small')).toBe(true);
    expect(exposesModel(member, 'large')).toBe(false);
  });
});
