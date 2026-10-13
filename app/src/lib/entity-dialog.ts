import { useState } from 'react';

/** The React key of a dialog that adds a new one, so it never shares state with a dialog open on an existing one. */
export const NEW_DIALOG_KEY = 'new';

/** create → the dialog adds a new one; edit → it changes the one it holds. */
type OpenDialog<T> = { mode: 'create' } | { mode: 'edit'; entity: T };

/** The create-or-edit dialog of a list, as the page drives it. */
export interface EntityDialog<T> {
  /** Whether the dialog is showing, in either mode. */
  isOpen: boolean;
  /** What is being edited; undefined while the dialog is closed or adding a new one. */
  entity: T | undefined;
  /** Opens the dialog to add a new one. */
  openCreate: () => void;
  /** Opens the dialog over an existing one. */
  openEdit: (entity: T) => void;
  /** The dialog's `onOpenChange`: closing it forgets what it was open on. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Holds which entity a list's dialog is open on, if any.
 *
 * @returns The dialog's state and the functions that open and close it.
 */
export function useEntityDialog<T>(): EntityDialog<T> {
  const [dialog, setDialog] = useState<OpenDialog<T>>();
  return {
    isOpen: dialog !== undefined,
    entity: dialog?.mode === 'edit' ? dialog.entity : undefined,
    openCreate: () => setDialog({ mode: 'create' }),
    openEdit: (entity) => setDialog({ mode: 'edit', entity }),
    onOpenChange: (open) => {
      if (open === false) {
        setDialog(undefined);
      }
    },
  };
}
