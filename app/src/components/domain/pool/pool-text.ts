import { PoolAffinity, type PoolStatus, PoolStrategy } from '@llm-router/shared';
import { formatCount, joinStats } from '@/lib/format';

/** What a choice is called on screen, and a line on what it does. */
interface ChoiceText {
  label: string;
  description: string;
}

/** How each strategy is named and explained. */
export const STRATEGY_TEXT = {
  [PoolStrategy.LeastBusy]: {
    label: 'Least busy',
    description: 'The target with the fewest requests in flight.',
  },
  [PoolStrategy.RoundRobin]: { label: 'Round robin', description: 'Each target in turn.' },
  [PoolStrategy.Random]: { label: 'Random', description: 'Any target, at random.' },
} satisfies Record<PoolStrategy, ChoiceText>;

/** How each affinity is named and explained. */
export const AFFINITY_TEXT = {
  [PoolAffinity.Sticky]: {
    label: 'Sticky',
    description: 'Requests from one conversation stay on one target, so its prompt cache is reused.',
  },
  [PoolAffinity.None]: { label: 'None', description: 'Every request is placed by the strategy.' },
} satisfies Record<PoolAffinity, ChoiceText>;

/**
 * Says how a pool places requests, for a bounded load or its absence.
 *
 * @param maxLoadFactor - The pool's bounded-load factor; undefined when it is off.
 * @returns "Off", or the factor as a multiple of the average.
 */
export function boundedLoadText(maxLoadFactor: number | undefined): string {
  return maxLoadFactor === undefined ? 'Off' : `${maxLoadFactor}× the average`;
}

/**
 * Sums a pool up in one line: how it places requests and how many targets it has.
 *
 * @param pool - The pool.
 * @returns E.g. "Least busy · sticky · bounded at 1.25× · 2 targets".
 */
export function poolSummary(pool: PoolStatus): string {
  const isSticky = pool.affinity === PoolAffinity.Sticky;
  const isBounded = isSticky && pool.maxLoadFactor !== undefined;
  return joinStats(
    STRATEGY_TEXT[pool.strategy].label,
    isSticky && 'sticky',
    isBounded && `bounded at ${pool.maxLoadFactor}×`,
    formatCount(pool.targets.length, 'target'),
  );
}
