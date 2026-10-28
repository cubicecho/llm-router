import { describe, expect, it } from 'vitest';
import { PoolAffinity, PoolStrategy, poolConfigSchema, workspaceConfigSchema } from '../config.ts';

describe('poolConfigSchema', () => {
  it('fills in a sticky, least-busy pool with bounded load off', () => {
    const pool = poolConfigSchema.parse({ name: 'llama70b' });

    expect(pool).toEqual({
      name: 'llama70b',
      enabled: true,
      strategy: PoolStrategy.LeastBusy,
      affinity: PoolAffinity.Sticky,
      targets: [],
    });
  });

  it('refuses a name with a slash, which would read as a provider model id', () => {
    expect(() => poolConfigSchema.parse({ name: 'gpu/llama' })).toThrow();
  });

  it('refuses a load factor below 1', () => {
    expect(() => poolConfigSchema.parse({ name: 'llama70b', maxLoadFactor: 0.5 })).toThrow();
  });

  it('keeps keys it does not know', () => {
    const pool = poolConfigSchema.parse({ name: 'llama70b', targets: [{ provider: 'a', model: 'm', note: 'x' }] });

    expect(pool.targets[0]).toEqual({ provider: 'a', model: 'm', note: 'x' });
  });
});

describe('workspaceConfigSchema', () => {
  it('reads a workspace file written before pools as serving none', () => {
    const workspace = workspaceConfigSchema.parse({ name: 'Team', slug: 'team' });

    expect(workspace.pools).toEqual([]);
  });
});
