import type { PoolStatus } from '@llm-router/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BoxesIcon } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { EnabledBadge } from '@/components/domain/enabled/enabled-badge';
import { DeletePoolButton } from '@/components/domain/pool/delete-pool-button';
import { PoolDialog } from '@/components/domain/pool/pool-dialog';
import { poolSummary } from '@/components/domain/pool/pool-text';
import { PAGE_BODY_CLASS } from '@/components/layouts/page-body';
import { RowList, RowListItem } from '@/components/layouts/row-list';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Pencil, Plus } from '@/components/ui/icons';
import { NEW_DIALOG_KEY, useEntityDialog } from '@/lib/entity-dialog';
import { usePools } from '@/lib/queries';

/** The `/pools` route. */
export const Route = createFileRoute('/pools')({
  component: PoolsPage,
});

/** The Pools page: every pool with how it places requests, and the create/edit dialog. */
function PoolsPage() {
  const pools = usePools();
  const { data } = pools;
  const hasPools = data !== undefined && data.length > 0;
  const dialog = useEntityDialog<PoolStatus>();
  const { openCreate } = dialog;
  const newButton = <Button variant="info" onClick={openCreate} iconSlot={<Plus />} content="New pool" />;

  return (
    <PageLayout
      title="Pools"
      description="Each pool serves one model from several servers under one name, and picks the server for each request."
      actionSlot={newButton}
      contentClassName={PAGE_BODY_CLASS}
      contentSlot={
        <>
          <QueryState
            query={pools}
            what="pools"
            count={data?.length ?? 0}
            emptySlot={
              <EmptyState
                icon={BoxesIcon}
                title="No pools yet"
                description="Create a pool to spread one model over the servers that run it, keeping each conversation on the server that has it cached."
                actionSlot={newButton}
              />
            }
          />

          {hasPools && (
            <CardLayout
              level={2}
              title="All pools"
              contentSlot={
                <RowList
                  contentSlot={data.map((pool) => (
                    <RowListItem
                      key={pool.name}
                      contentSlot={
                        <ListItem
                          title={pool.name}
                          titleClassName="font-mono"
                          description={<span className="text-foreground/60 text-xs">{poolSummary(pool)}</span>}
                          linkSlot={<Link to="/pools/$name" params={{ name: pool.name }} />}
                          meta={<EnabledBadge enabled={pool.enabled} />}
                          actionSlot={
                            <>
                              <ActionButton
                                variant="ghost"
                                size="icon-sm"
                                label={`Edit ${pool.name}`}
                                onClick={() => dialog.openEdit(pool)}
                                iconSlot={<Pencil />}
                              />
                              <DeletePoolButton pool={pool} />
                            </>
                          }
                        />
                      }
                    />
                  ))}
                />
              }
            />
          )}

          {dialog.isOpen && (
            <PoolDialog
              key={dialog.entity?.name ?? NEW_DIALOG_KEY}
              open
              onOpenChange={dialog.onOpenChange}
              pool={dialog.entity}
            />
          )}
        </>
      }
    />
  );
}
