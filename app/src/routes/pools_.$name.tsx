import { GLOBAL_ENDPOINT_PATH, PoolAffinity } from '@llm-router/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { EnabledSetting } from '@/components/domain/enabled/enabled-setting';
import { ConnectCard } from '@/components/domain/endpoint/connect-card';
import { DeletePoolButton } from '@/components/domain/pool/delete-pool-button';
import { PoolDialog } from '@/components/domain/pool/pool-dialog';
import { AFFINITY_TEXT, boundedLoadText, STRATEGY_TEXT } from '@/components/domain/pool/pool-text';
import { TargetsCard } from '@/components/domain/pool/targets-card';
import { PAGE_BODY_CLASS } from '@/components/layouts/page-body';
import { PageLayout } from '@/components/page-layout';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil } from '@/components/ui/icons';
import { usePool, useUpdatePool } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';

/** The `/pools/$name` route. */
export const Route = createFileRoute('/pools_/$name')({
  component: PoolDetailPage,
});

/** The page of one pool: its switch, how it places requests, its targets with their load, and how to call it. */
function PoolDetailPage() {
  const { name } = Route.useParams();
  const navigate = useNavigate();
  const query = usePool(name);
  const { data: pool } = query;
  const update = useUpdatePool();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <PageLayout
      iconSlot={
        <ActionButton
          variant="ghost"
          size="icon-sm"
          label="Back to pools"
          tooltip={false}
          linkSlot={<Link to="/pools" />}
          iconSlot={<ArrowLeft />}
        />
      }
      title={name}
      description={pool?.description}
      loading={query.isPending}
      contentClassName={PAGE_BODY_CLASS}
      contentSlot={
        <>
          <QueryState query={query} what="pool" count={pool ? 1 : 0} rows={1} />
          {pool && (
            <>
              <CardLayout
                level={2}
                title="Overview"
                actionSlot={
                  <span className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditOpen(true)}
                      iconSlot={<Pencil />}
                      content="Edit"
                    />
                    <DeletePoolButton pool={pool} isLabelled onDeleted={() => navigate({ to: '/pools' })} />
                  </span>
                }
                contentClassName="gap-4"
                contentSlot={
                  <>
                    <EnabledSetting
                      description="A disabled pool is served by no endpoint; its targets' providers are not affected."
                      enabled={pool.enabled}
                      saving={update.isPending}
                      onChange={(enabled) =>
                        update.mutate(
                          { name, enabled },
                          {
                            onSuccess: () => toastSuccess(`${enabled ? 'Enabled' : 'Disabled'} ${name}`),
                            onError: toastApiError,
                          },
                        )
                      }
                    />
                    <DescriptionList
                      contentSlot={
                        <>
                          <PropertyRow
                            label="Strategy"
                            value={STRATEGY_TEXT[pool.strategy].label}
                            hint={STRATEGY_TEXT[pool.strategy].description}
                          />
                          <PropertyRow
                            label="Affinity"
                            value={AFFINITY_TEXT[pool.affinity].label}
                            hint={AFFINITY_TEXT[pool.affinity].description}
                          />
                          <PropertyRow
                            label="Bounded load"
                            value={boundedLoadText(
                              pool.affinity === PoolAffinity.Sticky ? pool.maxLoadFactor : undefined,
                            )}
                          />
                        </>
                      }
                    />
                  </>
                }
              />

              <TargetsCard pool={pool} />

              <ConnectCard
                path={GLOBAL_ENDPOINT_PATH}
                model={name}
                description="Ask for the pool by its name, here or at any workspace that serves it."
              />

              {isEditOpen && <PoolDialog key={name} open pool={pool} onOpenChange={setIsEditOpen} />}
            </>
          )}
        </>
      }
    />
  );
}
