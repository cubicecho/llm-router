import { MODEL_SEPARATOR } from '@llm-router/shared';

/** A routed model id taken apart. */
export interface SplitModel {
  /** The provider that serves the model. */
  providerName: string;
  /** The model's id at that provider; may itself hold slashes. */
  upstreamId: string;
}

/**
 * Builds the id a client asks for from a provider and one of its models.
 *
 * @param providerName - The provider's name.
 * @param upstreamId - The model's id at the provider.
 * @returns `<provider>/<model>`.
 */
export function namespaceModel(providerName: string, upstreamId: string): string {
  return `${providerName}${MODEL_SEPARATOR}${upstreamId}`;
}

/**
 * Takes a routed model id apart at its first separator, which a provider name never holds.
 *
 * @param routedId - The id a client asked for.
 * @param providerNames - The providers in play.
 * @returns The parts, or undefined when the id has no provider prefix, an unknown one, or nothing after it.
 */
export function splitNamespacedModel(routedId: string, providerNames: readonly string[]): SplitModel | undefined {
  const separatorAt = routedId.indexOf(MODEL_SEPARATOR);
  if (separatorAt <= 0) {
    return undefined;
  }
  const providerName = routedId.slice(0, separatorAt);
  const upstreamId = routedId.slice(separatorAt + MODEL_SEPARATOR.length);
  if (upstreamId === '' || providerNames.includes(providerName) === false) {
    return undefined;
  }
  return { providerName, upstreamId };
}
