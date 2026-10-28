import { createHash } from 'node:crypto';
import { PoolAffinity, type PoolConfig, PoolStrategy, type ProviderConfig } from '@llm-router/shared';
import { namespaceModel } from './naming.ts';

/** Bytes of a hash read as a target's score: six fit a safe integer. */
const SCORE_BYTES = 6;

/** A pool target whose provider is enabled, so a request can go to it. */
export interface PoolCandidate {
  provider: ProviderConfig;
  /** The model's id at the provider. */
  model: string;
}

/** The target picked for one request. Its in-flight slot is held until `release` is called. */
export interface PoolLease extends PoolCandidate {
  /** Frees the slot; calling it again does nothing. */
  release: () => void;
}

/** What a strategy reads to pick a candidate. */
interface StrategyInput {
  /** The requests in flight to each candidate, in candidate order. */
  loads: readonly number[];
  /** How many requests this pool's round-robin has placed before this one. */
  turn: number;
  /** A number in [0, 1). */
  random: () => number;
}

/** Picks a candidate by its index. */
type Strategy = (input: StrategyInput) => number;

/** How each strategy picks, given at least one candidate. */
const PICK_BY_STRATEGY = {
  [PoolStrategy.RoundRobin]: ({ loads, turn }) => turn % loads.length,
  [PoolStrategy.LeastBusy]: ({ loads }) => loads.indexOf(Math.min(...loads)),
  [PoolStrategy.Random]: ({ loads, random }) => Math.floor(random() * loads.length),
} satisfies Record<PoolStrategy, Strategy>;

/**
 * Scores a target for a key; the same pair always scores the same.
 *
 * @param key - The request's affinity key.
 * @param targetId - The target's routed model id.
 * @returns A whole number; the highest-scoring target is the key's own.
 */
function rendezvousScore(key: string, targetId: string): number {
  return createHash('sha256').update(key).update('\n').update(targetId).digest().readUIntBE(0, SCORE_BYTES);
}

/**
 * Names a target the way a client would ask for it directly.
 *
 * @param target - The target.
 * @returns `<provider>/<model>`.
 */
function targetId(target: PoolCandidate): string {
  return namespaceModel(target.provider.name, target.model);
}

/**
 * Picks which of a pool's targets serves each request, and counts the requests each target has in flight.
 *
 * @remarks
 * A sticky request goes to the target its key ranks highest (rendezvous hashing), so a target leaving moves only its
 * own keys. With bounded load on, a target running over `maxLoadFactor` times the average is passed over for the next
 * in the key's ranking. The counts live in memory and start at zero.
 */
export class PoolBalancer {
  private readonly inFlight = new Map<string, number>();
  private readonly turns = new Map<string, number>();
  private readonly random: () => number;

  /**
   * Builds a balancer with nothing in flight.
   *
   * @param [random] - Returns a number in [0, 1); the random strategy reads it.
   */
  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /**
   * Picks the target for one request and holds a slot on it.
   *
   * @param pool - The pool the request named.
   * @param candidates - Its targets whose provider is enabled, in the pool's order.
   * @param key - The request's affinity key; undefined when it has none.
   * @returns The target, with `release` to call when the answer ends.
   * @throws When there is no candidate: the caller answers that case itself.
   */
  acquire(pool: PoolConfig, candidates: readonly PoolCandidate[], key: string | undefined): PoolLease {
    const loads = candidates.map((candidate) => this.inFlightTo(candidate.provider.name, candidate.model));
    const isSticky = pool.affinity === PoolAffinity.Sticky && key !== undefined;
    const index = isSticky ? this.pickSticky(pool, candidates, loads, key) : this.pickByStrategy(pool, loads);
    const chosen = candidates[index];
    if (!chosen) {
      throw new Error(`Pool "${pool.name}" has no target to send a request to`);
    }
    return this.hold(chosen);
  }

  /**
   * Counts the requests in flight to one target.
   *
   * @param providerName - The target's provider.
   * @param model - The model's id at the provider.
   * @returns The requests sent to it that have not finished.
   */
  inFlightTo(providerName: string, model: string): number {
    return this.inFlight.get(namespaceModel(providerName, model)) ?? 0;
  }

  /**
   * Picks by the pool's strategy.
   *
   * @param pool - The pool.
   * @param loads - The requests in flight to each candidate.
   * @returns The candidate's index.
   */
  private pickByStrategy(pool: PoolConfig, loads: readonly number[]): number {
    const turn = this.turns.get(pool.name) ?? 0;
    const isRoundRobin = pool.strategy === PoolStrategy.RoundRobin;
    if (isRoundRobin) {
      this.turns.set(pool.name, turn + 1);
    }
    return PICK_BY_STRATEGY[pool.strategy]({ loads, turn, random: this.random });
  }

  /**
   * Picks the candidate the key ranks highest, passing over one that bounded load says is full.
   *
   * @param pool - The pool, for its `maxLoadFactor`.
   * @param candidates - The candidates.
   * @param loads - The requests in flight to each candidate.
   * @param key - The request's affinity key.
   * @returns The candidate's index.
   */
  private pickSticky(
    pool: PoolConfig,
    candidates: readonly PoolCandidate[],
    loads: readonly number[],
    key: string,
  ): number {
    const ranked = candidates
      .map((candidate, index) => ({ index, score: rendezvousScore(key, targetId(candidate)) }))
      .sort((a, b) => b.score - a.score);
    const factor = pool.maxLoadFactor;
    if (factor === undefined) {
      return ranked[0]?.index ?? 0;
    }
    // Counting this request, no target may hold more than `factor` times the average. One always has room.
    const total = loads.reduce((sum, load) => sum + load, 0);
    const capacity = Math.ceil((factor * (total + 1)) / candidates.length);
    const withRoom = ranked.find(({ index }) => (loads[index] ?? 0) < capacity);
    return withRoom?.index ?? 0;
  }

  /**
   * Counts a request against a target until it is released.
   *
   * @param target - The target.
   * @returns The lease on it.
   */
  private hold(target: PoolCandidate): PoolLease {
    const id = targetId(target);
    this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + 1);
    let isHeld = true;
    const release = (): void => {
      if (isHeld) {
        isHeld = false;
        const remaining = (this.inFlight.get(id) ?? 1) - 1;
        if (remaining > 0) {
          this.inFlight.set(id, remaining);
        } else {
          this.inFlight.delete(id);
        }
      }
    };
    return { ...target, release };
  }
}
