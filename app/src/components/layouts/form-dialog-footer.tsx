import { Button } from '@/components/ui/button';
import type { SlotNode } from '@/lib/utils';

interface FormDialogFooterProps {
  /** Closes the dialog, asking first when the form has unsaved changes. */
  onCancel: () => void;
  /** The form's submit button, which stays on the default variant. */
  submitSlot: SlotNode;
}

/** The footer of a form dialog: Cancel, then the submit button. */
export function FormDialogFooter({ onCancel, submitSlot }: FormDialogFooterProps) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel} content="Cancel" />
      {submitSlot}
    </>
  );
}
