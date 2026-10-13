import type { ProviderConfig, WorkspaceConfig } from '@llm-router/shared';
import { describe, expect, it } from 'vitest';
import type { ConfigStore } from '../../config/store.ts';
import { exposesModel, globalScope, workspaceScope } from '../endpoint-scope.ts';

const ALPHA: ProviderConfig = { name: 'alpha', enabled: true, baseUrl: 'http://alpha.test/v1', headers: {} };
const BETA: ProviderConfig = { name: 'beta', enabled: true, baseUrl: 'http://beta.test/v1', headers: {} };
const OFF: ProviderConfig = { name: 'off', enabled: false, baseUrl: 'http://off.test/v1', headers: {} };

/** The two store reads a scope is built from, over a fixed list of providers. */
function storeOf(providers: ProviderConfig[]): Pick<ConfigStore, 'getProviders' | 'getProvider'> {
  return {
    getProviders: () => providers,
    getProvider: (name) => providers.find((provider) => provider.name === name),
  };
}

const STORE = storeOf([ALPHA, BETA, OFF]) as ConfigStore;

describe('globalScope', () => {
  it('holds every enabled provider, with no model filter', () => {
    const scope = globalScope(STORE);
    expect(scope.members).toEqual([{ provider: ALPHA }, { provider: BETA }]);
    expect(scope.workspace).toBeUndefined();
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
  };

  it('holds the enabled members that name an enabled provider, each with its allowlist', () => {
    const scope = workspaceScope(workspace, STORE);
    expect(scope.members).toEqual([{ provider: ALPHA, allowedModels: ['small'] }]);
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
