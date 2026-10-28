import type { PoolStatus } from '@llm-router/shared';
import { ConfirmButton } from '@/components/confirm-button';
import { Trash2 } from '@/components/ui/icons';
import { useDeletePool } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';

interface DeletePoolButtonProps {
  /** The pool the button deletes. */
  pool: PoolStatus;
  /** Draws the button with its "Delete" label, for a card's header; left out, it is the icon alone, for a row. */
  isLabelled?: boolean;
  /** Called once the pool is gone, so a page showing it can leave. */
  onDeleted?: () => void;
}

/** The button that deletes a pool, after asking, and says so in a toast. */
export function DeletePoolButton({ pool, isLabelled = false, onDeleted }: DeletePoolButtonProps) {
  const remove = useDeletePool();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const { name } = pool;

  const handleConfirm = () => {
    remove.mutate(name, {
      onSuccess: () => {
        toastSuccess(`Deleted pool ${name}`);
        onDeleted?.();
      },
      onError: toastApiError,
    });
  };

  const confirmation = {
    label: `Delete ${name}`,
    title: `Delete pool ${name}?`,
    description: `Clients asking for "${name}" get model_not_found, and every workspace stops serving it. Its providers are not affected.`,
    onConfirm: handleConfirm,
    iconSlot: <Trash2 className="text-negative" />,
  };

  if (isLabelled) {
    return (
      <ConfirmButton
        {...confirmation}
        variant="outline"
        size="sm"
        tooltip={false}
        loading={remove.isPending}
        content="Delete"
      />
    );
  }
  return <ConfirmButton {...confirmation} variant="ghost" size="icon-sm" />;
}
