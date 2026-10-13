import { useToast } from '@/components/ui/toast';
import { ApiRequestError } from './api.ts';

/** What a `CopyButton` whose clipboard write was refused says. */
export const COPY_FAILED_MESSAGE = 'Failed to copy to clipboard';

/**
 * Words a failed mutation for an error toast.
 *
 * @param error - Whatever was thrown.
 * @returns The error's message; an `ApiRequestError` with a detail reads `message: detail`.
 */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.detail) {
    return `${error.message}: ${error.detail}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Gives a mutation's `onError` a handler that says what went wrong in a toast.
 *
 * @returns A function that shows whatever was thrown as an error toast.
 */
export function useApiErrorToast(): (error: unknown) => void {
  const toast = useToast();
  return (error) => toast(apiErrorMessage(error));
}

/**
 * Gives a mutation's `onSuccess` a way to say what was done in a toast.
 *
 * @returns A function that shows a message as a success toast.
 */
export function useSuccessToast(): (message: string) => void {
  const toast = useToast();
  return (message) => toast(message, 'positive');
}
