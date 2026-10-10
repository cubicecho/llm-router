import { CardLayout } from '@/components/card-layout';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { QueryState } from '@/components/query-state';
import { useUsage } from '@/lib/queries';
import { UsageText } from './usage-text.tsx';

interface UsageCardProps {
  /** The provider's name. */
  provider: string;
}

/**
 * What one provider has been asked for: its totals, then each model that has been called. A model the provider no
 * longer lists keeps its row, since its tokens were still spent.
 */
export function UsageCard({ provider }: UsageCardProps) {
  const query = useUsage();
  const usage = query.data?.providers.find((entry) => entry.provider === provider);
  const models = usage?.models ?? [];

  return (
    <CardLayout
      level={2}
      title="Usage"
      description="Requests the provider answered through this router and the tokens it reported for them, in and out."
      contentClassName="gap-3"
      contentSlot={
        <>
          <QueryState
            query={query}
            what="usage"
            count={models.length}
            rows={1}
            emptySlot={<EmptyState compact title="No requests yet." />}
          />
          {usage && (
            <ul className="flex flex-col divide-y divide-foreground/10">
              <li className="py-1">
                <ListItem title="All models" titleClassName="font-medium" meta={<UsageText usage={usage} />} />
              </li>
              {models.map((model) => (
                <li key={model.upstreamId} className="py-1">
                  <ListItem title={model.upstreamId} titleClassName="font-mono" meta={<UsageText usage={model} />} />
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  );
}
