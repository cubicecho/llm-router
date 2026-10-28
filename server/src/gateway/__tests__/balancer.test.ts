import { PoolAffinity, type PoolConfig, PoolStrategy, type ProviderConfig, poolConfigSchema } from '@llm-router/shared';
import { describe, expect, it } from 'vitest';
import { PoolBalancer, type PoolCandidate } from '../balancer.ts';

/**
 * Builds an enabled provider.
 *
 * @param name - Its name.
 * @returns The provider.
 */
function provider(name: string): ProviderConfig {
  return { name, enabled: true, baseUrl: `http://${name}.test/v1`, headers: {} };
}

const CANDIDATES: PoolCandidate[] = ['gpu-a', 'gpu-b', 'gpu-c'].map((name) => ({
  provider: provider(name),
  model: 'llama',
}));

/**
 * Builds a pool over the three test candidates.
 *
 * @param overrides - Fields that differ from a least-busy pool with no affinity.
 * @returns The pool.
 */
function pool(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return poolConfigSchema.parse({
    name: 'llama',
    strategy: PoolStrategy.LeastBusy,
    affinity: PoolAffinity.None,
    ...overrides,
  });
}

/**
 * Places requests and keeps their leases open.
 *
 * @param balancer - The balancer.
 * @param config - The pool.
 * @param keys - One affinity key per request; undefined for none.
 * @returns The provider each request went to.
 */
function place(balancer: PoolBalancer, config: PoolConfig, keys: readonly (string | undefined)[]): string[] {
  return keys.map((key) => balancer.acquire(config, CANDIDATES, key).provider.name);
}

describe('PoolBalancer strategies', () => {
  it('takes the targets in turn for round-robin', () => {
    const picked = place(new PoolBalancer(), pool({ strategy: PoolStrategy.RoundRobin }), [
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    expect(picked).toEqual(['gpu-a', 'gpu-b', 'gpu-c', 'gpu-a']);
  });

  it('spreads open requests over the least busy target, earliest first on a tie', () => {
    const balancer = new PoolBalancer();
    const config = pool();
    const first = balancer.acquire(config, CANDIDATES, undefined);
    place(balancer, config, [undefined, undefined]);
    first.release();

    expect(balancer.acquire(config, CANDIDATES, undefined).provider.name).toBe('gpu-a');
  });

  it('picks by the random number for random', () => {
    const balancer = new PoolBalancer(() => 0.7);

    expect(place(balancer, pool({ strategy: PoolStrategy.Random }), [undefined])).toEqual(['gpu-c']);
  });

  it('throws when the pool has no candidate', () => {
    expect(() => new PoolBalancer().acquire(pool(), [], undefined)).toThrow(/no target/);
  });
});

describe('PoolBalancer in-flight counts', () => {
  it('counts a lease until it is released, once', () => {
    const balancer = new PoolBalancer();
    const lease = balancer.acquire(pool(), CANDIDATES, undefined);
    expect(balancer.inFlightTo('gpu-a', 'llama')).toBe(1);

    lease.release();
    lease.release();

    expect(balancer.inFlightTo('gpu-a', 'llama')).toBe(0);
  });
});

describe('PoolBalancer sticky affinity', () => {
  it('sends every request with the same key to the same target, whatever the load', () => {
    const balancer = new PoolBalancer();
    const picked = place(balancer, pool({ affinity: PoolAffinity.Sticky }), ['chat-1', 'chat-1', 'chat-1', 'chat-1']);

    expect(new Set(picked).size).toBe(1);
  });

  it('spreads different keys over the targets', () => {
    const keys = Array.from({ length: 60 }, (_, index) => `chat-${index}`);
    const picked = place(new PoolBalancer(), pool({ affinity: PoolAffinity.Sticky }), keys);

    expect(new Set(picked)).toEqual(new Set(['gpu-a', 'gpu-b', 'gpu-c']));
  });

  it('moves only the keys of a target that leaves', () => {
    const config = pool({ affinity: PoolAffinity.Sticky });
    const keys = Array.from({ length: 60 }, (_, index) => `chat-${index}`);
    const before = keys.map((key) => {
      const lease = new PoolBalancer().acquire(config, CANDIDATES, key);
      return lease.provider.name;
    });
    const withoutC = CANDIDATES.filter((candidate) => candidate.provider.name !== 'gpu-c');
    const after = keys.map((key) => new PoolBalancer().acquire(config, withoutC, key).provider.name);

    const moved = keys.filter((_, index) => before[index] !== after[index]);
    const movedFromC = keys.filter((_, index) => before[index] === 'gpu-c');
    expect(moved).toEqual(movedFromC);
  });

  it('uses the strategy for a request without a key', () => {
    const picked = place(
      new PoolBalancer(),
      pool({ affinity: PoolAffinity.Sticky, strategy: PoolStrategy.RoundRobin }),
      [undefined, undefined],
    );

    expect(picked).toEqual(['gpu-a', 'gpu-b']);
  });

  it('passes over a target that bounded load says is full, to the next in the key ranking', () => {
    const balancer = new PoolBalancer();
    const config = pool({ affinity: PoolAffinity.Sticky, maxLoadFactor: 1 });
    const picked = place(balancer, config, ['chat-1', 'chat-1', 'chat-1']);

    // With a factor of 1, three requests over three targets leave room for one each.
    expect(new Set(picked).size).toBe(3);
  });

  it('keeps a key on its own target while that target is under the bound', () => {
    const balancer = new PoolBalancer();
    const config = pool({ affinity: PoolAffinity.Sticky, maxLoadFactor: 2 });
    const [first, second] = place(balancer, config, ['chat-1', 'chat-1']);

    expect(second).toBe(first);
  });
});
