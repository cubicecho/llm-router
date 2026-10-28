import type { WorkspaceStatus } from '@llm-router/shared';
import { Link } from '@tanstack/react-router';
import { CardLayout } from '@/components/card-layout';
import { EnabledBadge } from '@/components/domain/enabled/enabled-badge';
import { EmptyState } from '@/components/page';
import { QueryState } from '@/components/query-state';
import { SettingRow } from '@/components/setting-row';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePools, useUpdateWorkspace } from '@/lib/queries';
import { useApiErrorToast } from '@/lib/toast';
import { poolSummary } from './pool-text.ts';

interface PoolsCardProps {
  /** The workspace whose pools the card edits. */
  workspace: WorkspaceStatus;
}

/**
 * The pools a workspace serves: every pool with a switch that puts it in the workspace. A pool brings its own
 * targets, so its providers need not be the workspace's. A switch saves at once.
 */
export function PoolsCard({ workspace }: PoolsCardProps) {
  const pools = usePools();
  const update = useUpdateWorkspace();
  const toastApiError = useApiErrorToast();

  const setServed = (name: string, isOn: boolean) => {
    const others = workspace.pools.filter((pool) => pool !== name);
    update.mutate({ slug: workspace.slug, pools: isOn ? [...others, name] : others }, { onError: toastApiError });
  };

  return (
    <CardLayout
      level={2}
      title="Pools"
      description="The pools this workspace serves, each asked for by its name. A pool brings its own targets."
      contentClassName="gap-4"
      contentSlot={
        <>
          <QueryState
            query={pools}
            what="pools"
            count={pools.data?.length ?? 0}
            emptySlot={
              <EmptyState
                compact
                title="No pools yet."
                actionSlot={<Button variant="outline" size="sm" linkSlot={<Link to="/pools" />} content="Add a pool" />}
              />
            }
          />
          {pools.data?.map((pool) => {
            const isServed = workspace.pools.includes(pool.name);
            return (
              <SettingRow
                key={pool.name}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{pool.name}</span>
                    {pool.enabled === false && <EnabledBadge enabled={false} />}
                  </span>
                }
                description={poolSummary(pool)}
                actionSlot={
                  <Switch
                    checked={isServed}
                    // Each save sends the whole list: a second one sent before the first lands would undo it.
                    disabled={update.isPending}
                    onCheckedChange={(isOn) => setServed(pool.name, isOn)}
                    aria-label={`Serve ${pool.name}`}
                  />
                }
              />
            );
          })}
        </>
      }
    />
  );
}
