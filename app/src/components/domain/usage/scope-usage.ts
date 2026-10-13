import { type DayUsage, MODEL_SEPARATOR, type TokenUsage, type UsageResponse } from '@llm-router/shared';
import { useUsage } from '@/lib/queries';

/** Whose usage is shown: one provider's, or what went through one workspace's endpoint. */
export interface UsageScope {
  kind: 'provider' | 'workspace';
  /** The provider's name, or the workspace's slug. */
  id: string;
}

/** One model's row: the id to show and its counts. */
export interface ModelRow extends TokenUsage {
  id: string;
}

/** The usage of one scope: the totals, a row per model and a row per day, newest first. */
export interface ScopeUsage {
  totals: TokenUsage;
  models: ModelRow[];
  days: DayUsage[];
}

/** Reads one scope's usage out of the usage answer, by the scope's kind. */
const USAGE_BY_KIND = {
  provider: (answer, name) => {
    const found = answer.providers.find((entry) => entry.provider === name);
    return (
      found && {
        totals: found,
        models: found.models.map((model) => ({ ...model, id: model.upstreamId })),
        days: found.days,
      }
    );
  },
  workspace: (answer, slug) => {
    const found = answer.workspaces.find((entry) => entry.workspace === slug);
    return (
      found && {
        totals: found,
        // A workspace serves several providers, so its models go by the id a client asks for.
        models: found.models.map((model) => ({
          ...model,
          id: `${model.provider}${MODEL_SEPARATOR}${model.upstreamId}`,
        })),
        days: found.days,
      }
    );
  },
} satisfies Record<UsageScope['kind'], (answer: UsageResponse, id: string) => ScopeUsage | undefined>;

/** The usage query and what it holds for one scope. */
export interface ScopeUsageResult {
  query: ReturnType<typeof useUsage>;
  /** Nothing when the scope has not been called or the answer is not in yet. */
  usage: ScopeUsage | undefined;
}

/**
 * Reads one provider's or one workspace's usage out of the usage answer.
 *
 * @param scope - The provider or the workspace.
 * @returns The query, and the scope's totals, models and days.
 */
export function useScopeUsage(scope: UsageScope): ScopeUsageResult {
  const query = useUsage();
  const usage = query.data && USAGE_BY_KIND[scope.kind](query.data, scope.id);
  return { query, usage };
}
