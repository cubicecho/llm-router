import type { ModelsResponse } from '@llm-router/shared';
import { apiErrorMessage } from './toast.ts';

/** The parts of a provider's model listing query that say whether it failed. */
interface ListingQuery {
  /** The router's answer, which names the provider under `skipped` when the provider could not be listed. */
  data?: ModelsResponse | undefined;
  /** What the request itself failed with, or null. */
  error: unknown;
}

/**
 * Reads why a provider's models could not be listed.
 *
 * @param listing - The model listing query.
 * @returns The provider's own error when the router skipped it, the request's error when that failed, or undefined
 * when the listing worked or is still loading.
 */
export function listingFailure(listing: ListingQuery): string | undefined {
  const skippedError = listing.data?.skipped[0]?.error;
  if (skippedError !== undefined) {
    return skippedError;
  }
  const hasRequestFailed = listing.error !== null && listing.error !== undefined;
  return hasRequestFailed ? apiErrorMessage(listing.error) : undefined;
}
