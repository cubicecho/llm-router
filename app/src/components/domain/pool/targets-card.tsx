import type { PoolStatus, TargetLoad } from '@llm-router/shared';
import { useState } from 'react';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { EnabledBadge } from '@/components/domain/enabled/enabled-badge';
import { RowList, RowListItem } from '@/components/layouts/row-list';
import { ListItem } from '@/components/list-item';
import { EmptyState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from '@/components/ui/icons';
import { formatCount } from '@/lib/format';
import { usePoolLoad, useUpdatePool } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';
import { AddTargetDialog } from './add-target-dialog.tsx';

/**
 * Says how busy a target is, or why the pool skips it.
 *
 * @param load - The target's live load; undefined until the first answer.
 * @returns One line for under the target's id.
 */
function loadText(load: TargetLoad | undefined): string {
  if (!load) {
    return 'Load not known yet';
  }
  if (load.available === false) {
    return 'Its provider is disabled or gone, so the pool skips it.';
  }
  return `${formatCount(load.inFlight, 'request')} in flight`;
}

interface TargetsCardProps {
  /** The pool whose targets the card shows and edits. */
  pool: PoolStatus;
}

/**
 * A pool's targets, each with its requests in flight, polled. A target is added in a dialog and removed after asking.
 */
export function TargetsCard({ pool }: TargetsCardProps) {
  const load = usePoolLoad(pool.name);
  const update = useUpdatePool();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const hasTargets = pool.targets.length > 0;

  const removeTarget = (index: number) => {
    const removed = pool.targets[index];
    const targets = pool.targets.filter((_, at) => at !== index);
    update.mutate(
      { name: pool.name, targets },
      {
        onSuccess: () => toastSuccess(`Removed ${removed?.provider}/${removed?.model} from ${pool.name}`),
        onError: toastApiError,
      },
    );
  };

  const addButton = (
    <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)} iconSlot={<Plus />} content="Add target" />
  );

  return (
    <CardLayout
      level={2}
      title="Targets"
      description="Where the pool sends requests: the same model on each server that runs it."
      actionSlot={hasTargets && addButton}
      contentSlot={
        <>
          {hasTargets ? (
            <RowList
              label="Targets"
              contentSlot={pool.targets.map((target, index) => {
                const id = `${target.provider}/${target.model}`;
                // The load answer lists the targets in the pool's order.
                const targetLoad = load.data?.targets[index];
                const isSkipped = targetLoad?.available === false;
                return (
                  <RowListItem
                    // biome-ignore lint/suspicious/noArrayIndexKey: a pool may list one target twice, to weight it.
                    key={`${id}#${index}`}
                    contentSlot={
                      <ListItem
                        title={id}
                        titleClassName="font-mono"
                        description={<span className="text-foreground/60 text-xs">{loadText(targetLoad)}</span>}
                        meta={isSkipped && <EnabledBadge enabled={false} />}
                        actionSlot={
                          <ConfirmButton
                            variant="ghost"
                            size="icon-sm"
                            label={`Remove ${id}`}
                            title={`Remove ${id} from ${pool.name}?`}
                            description="The pool stops sending requests to it. Requests already sent finish."
                            confirmLabel="Remove"
                            disabled={update.isPending}
                            onConfirm={() => removeTarget(index)}
                            iconSlot={<Trash2 className="text-negative" />}
                          />
                        }
                      />
                    }
                  />
                );
              })}
            />
          ) : (
            <EmptyState
              compact
              title="No targets yet. Requests for this pool answer 503 until it has one."
              actionSlot={addButton}
            />
          )}
          {isAddOpen && <AddTargetDialog open pool={pool} onOpenChange={setIsAddOpen} />}
        </>
      }
    />
  );
}
