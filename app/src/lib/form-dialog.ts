import { useState } from 'react';
import { apiErrorMessage } from './toast.ts';

/** What a form dialog needs to show a save the router refused. */
export interface ServerErrorState {
  /** The refusal's message, or undefined when the last save went through or none was tried. */
  serverError: string | undefined;
  /**
   * Runs a save, keeping the message of a failed one.
   *
   * @param save - Sends the form and does what follows a success, closing the dialog included.
   * @returns A promise that settles when the save has, and never rejects.
   */
  submit: (save: () => Promise<void>) => Promise<void>;
}

/**
 * Holds the message of a form dialog's last refused save, for the alert above its fields.
 *
 * @returns The message and the function to run a save through.
 */
export function useServerError(): ServerErrorState {
  const [serverError, setServerError] = useState<string>();
  const submit = async (save: () => Promise<void>): Promise<void> => {
    setServerError(undefined);
    try {
      await save();
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  };
  return { serverError, submit };
}

/**
 * Builds the question a form dialog asks before it closes.
 *
 * @param form - The dialog's form.
 * @returns A function that is true while a field differs from what the dialog opened with.
 */
export function unsavedChangesOf(form: { state: { isDefaultValue: boolean } }): () => boolean {
  return () => form.state.isDefaultValue === false;
}
