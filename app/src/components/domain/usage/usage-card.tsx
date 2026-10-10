import type { DayUsage, TokenUsage } from '@llm-router/shared';
import { useState } from 'react';
import { CardLayout } from '@/components/card-layout';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { USAGE_VIEW_DEFAULTS } from '@/lib/defaults';
import { formatCount } from '@/lib/format';
import { useUsage } from '@/lib/queries';
import { dayLabel } from '@/lib/usage';
import { UsageText } from './usage-text.tsx';

/** Whose usage a card shows: one provider's, by its name, or what went through one workspace's endpoint, by its slug. */
export type UsageScope = { provider: string } | { workspace: string };

interface UsageCardProps {
  /** The provider or the workspace to show. */
  scope: UsageScope;
}

/** One model's row: the id to show and its counts. */
interface ModelRow extends TokenUsage {
  id: string;
}

/** What a card draws: the totals, a row per model and a row per day, newest first. */
interface ScopeUsage {
  totals: TokenUsage;
  models: ModelRow[];
  days: DayUsage[];
}

const DESCRIPTIONS = {
  provider: 'Requests the provider answered through this router and the tokens it reported for them, in and out.',
  workspace:
    "Requests answered through this workspace's endpoint and the tokens the providers reported for them, in and out.",
} as const;

/**
 * Reads one provider's or one workspace's usage out of the usage answer.
 *
 * @param scope - The provider or the workspace.
 * @returns Its totals, models and days, or nothing when it has not been called or the answer is not in yet.
 */
function useScopeUsage(scope: UsageScope): { query: ReturnType<typeof useUsage>; usage: ScopeUsage | undefined } {
  const query = useUsage();
  if ('provider' in scope) {
    const found = query.data?.providers.find((entry) => entry.provider === scope.provider);
    const usage = found && {
      totals: found,
      models: found.models.map((model) => ({ ...model, id: model.upstreamId })),
      days: found.days,
    };
    return { query, usage };
  }
  const found = query.data?.workspaces.find((entry) => entry.workspace === scope.workspace);
  const usage = found && {
    totals: found,
    // A workspace serves several providers, so its models go by the id a client asks for.
    models: found.models.map((model) => ({ ...model, id: `${model.provider}/${model.upstreamId}` })),
    days: found.days,
  };
  return { query, usage };
}

/**
 * What one provider, or one workspace's endpoint, has been asked for: the totals, each model that has been called, and
 * each recent day. A model that is no longer listed keeps its row, since its tokens were still spent. The totals are
 * all-time, so they can be more than the days add up to: the router keeps a day's own counts only for a while.
 */
export function UsageCard({ scope }: UsageCardProps) {
  const { query, usage } = useScopeUsage(scope);
  const [isShowingAllDays, setIsShowingAllDays] = useState(false);
  const days = usage?.days ?? [];
  const shownDays = isShowingAllDays ? days : days.slice(0, USAGE_VIEW_DEFAULTS.recentDays);

  return (
    <CardLayout
      level={2}
      title="Usage"
      description={'provider' in scope ? DESCRIPTIONS.provider : DESCRIPTIONS.workspace}
      contentClassName="gap-3"
      contentSlot={
        <>
          <QueryState
            query={query}
            what="usage"
            count={usage ? 1 : 0}
            rows={1}
            emptySlot={<EmptyState compact title="No requests yet." />}
          />
          {usage && (
            <>
              <ul aria-label="Usage by model" className="flex flex-col divide-y divide-foreground/10">
                <li className="py-1">
                  <ListItem title="All models" titleClassName="font-medium" meta={<UsageText usage={usage.totals} />} />
                </li>
                {usage.models.map((model) => (
                  <li key={model.id} className="py-1">
                    <ListItem title={model.id} titleClassName="font-mono" meta={<UsageText usage={model} />} />
                  </li>
                ))}
              </ul>
              {days.length > 0 && (
                <>
                  <h3 className="pt-2 font-medium text-sm">By day</h3>
                  <ul aria-label="Usage by day" className="flex flex-col divide-y divide-foreground/10">
                    {shownDays.map((day) => (
                      <li key={day.day} className="py-1">
                        <ListItem title={dayLabel(day.day)} meta={<UsageText usage={day} />} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {days.length > USAGE_VIEW_DEFAULTS.recentDays && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={isShowingAllDays}
                    onClick={() => setIsShowingAllDays((shown) => shown === false)}
                    content={
                      isShowingAllDays
                        ? `Show the last ${formatCount(USAGE_VIEW_DEFAULTS.recentDays, 'day')}`
                        : `Show all ${formatCount(days.length, 'day')}`
                    }
                  />
                </div>
              )}
            </>
          )}
        </>
      }
    />
  );
}
