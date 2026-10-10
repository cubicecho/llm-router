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
