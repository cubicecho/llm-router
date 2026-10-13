import { useState } from 'react';
import { CardLayout } from '@/components/card-layout';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { USAGE_VIEW_DEFAULTS } from '@/lib/defaults';
import { formatCount } from '@/lib/format';
import { dayLabel } from '@/lib/usage';
import { type UsageScope, useScopeUsage } from './scope-usage.ts';
import { UsageText } from './usage-text.tsx';

interface UsageCardProps {
  /** The provider or the workspace to show. */
  scope: UsageScope;
}

/** The line under the card title, by whose usage the card shows. */
const DESCRIPTIONS = {
  provider: 'Requests the provider answered through this router and the tokens it reported for them, in and out.',
  workspace:
    "Requests answered through this workspace's endpoint and the tokens the providers reported for them, in and out.",
} as const satisfies Record<UsageScope['kind'], string>;

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
      description={DESCRIPTIONS[scope.kind]}
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
