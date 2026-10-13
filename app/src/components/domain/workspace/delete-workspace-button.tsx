import type { WorkspaceStatus } from '@llm-router/shared';
import { ConfirmButton } from '@/components/confirm-button';
import { Trash2 } from '@/components/ui/icons';
import { useDeleteWorkspace } from '@/lib/queries';
import { useApiErrorToast, useSuccessToast } from '@/lib/toast';

interface DeleteWorkspaceButtonProps {
  /** The workspace the button deletes. */
  workspace: WorkspaceStatus;
  /** Draws the button with its "Delete" label, for a card's header; left out, it is the icon alone, for a row. */
  isLabelled?: boolean;
  /** Called once the workspace is gone, so a page showing it can leave. */
  onDeleted?: () => void;
}

/** The button that deletes a workspace, after asking, and says so in a toast. */
export function DeleteWorkspaceButton({ workspace, isLabelled = false, onDeleted }: DeleteWorkspaceButtonProps) {
  const remove = useDeleteWorkspace();
  const toastSuccess = useSuccessToast();
  const toastApiError = useApiErrorToast();
  const label = workspace.name;

  const handleConfirm = () => {
    remove.mutate(workspace.slug, {
      onSuccess: () => {
        toastSuccess(`Deleted workspace ${label}`);
        onDeleted?.();
      },
      onError: toastApiError,
    });
  };

  const confirmation = {
    label: `Delete ${label}`,
    title: `Delete workspace ${label}?`,
    description: `The workspace's endpoint (${workspace.path}) stops responding. Its providers are not affected.`,
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
