import type { ProviderStatus } from '@llm-router/shared';
import { ConfirmButton } from '@/components/confirm-button';
import { providerLabel } from '@/components/domain/provider/provider-label';
import { Trash2 } from '@/components/ui/icons';
import { useDeleteProvider } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';

interface DeleteProviderButtonProps {
  /** The provider the button deletes. */
  provider: ProviderStatus;
  /** Draws the button with its "Delete" label, for a card's header; left out, it is the icon alone, for a row. */
  isLabelled?: boolean;
  /** Called once the provider is gone, so a page showing it can leave. */
  onDeleted?: () => void;
}

/** The button that deletes a provider, after asking, and says so in a toast. */
export function DeleteProviderButton({ provider, isLabelled = false, onDeleted }: DeleteProviderButtonProps) {
  const remove = useDeleteProvider();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const label = providerLabel(provider);

  const handleConfirm = () => {
    remove.mutate(provider.name, {
      onSuccess: () => {
        toastSuccess(`Deleted provider ${label}`);
        onDeleted?.();
      },
      onError: toastApiError,
    });
  };

  const confirmation = {
    label: `Delete ${label}`,
    title: `Delete provider ${label}?`,
    description: `Its models (${provider.name}/…) stop being served, and it is removed from every workspace. The server itself is not affected.`,
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
