import type { ProviderConfig } from '@llm-router/shared';
import { isRecord } from '../core/is-record.ts';
import type { UpstreamModel } from './models.ts';
import { providerHeaders } from './provider-headers.ts';
import { fetchWithin, serverRoot, type UpstreamFetch } from './upstream-fetch.ts';

/** Where llama.cpp's server answers with its settings, at its root beside (not under) its `/v1`. */
export const PROPS_PATH = '/props';

/**
 * Builds the URL of a provider's `/props` for one model.
 *
 * @param provider - The provider.
 * @param upstreamId - The model's id at the provider. A llama.cpp router reads it; a single-model server ignores it.
 * @returns `<server root>/props?model=<id>`.
 */
export function propsUrl(provider: ProviderConfig, upstreamId: string): string {
  return `${serverRoot(provider.baseUrl)}${PROPS_PATH}?model=${encodeURIComponent(upstreamId)}`;
}

/** The `owned_by` llama.cpp's server puts on every model it lists. */
const LLAMA_CPP_OWNER = 'llamacpp';

/** The key the served window is listed under, the first one OpenAI-compatible clients read. */
const CONTEXT_LENGTH_KEY = 'context_length';

/** The `status.value` a llama.cpp router gives a model that is running. */
const LOADED_STATUS = 'loaded';

/**
 * Tells whether a listing comes from llama.cpp's server.
 *
 * @param models - The provider's listing.
 * @returns True when an entry is owned by `llamacpp` or carries llama.cpp's `meta.n_ctx_train`.
 *
 * @remarks
 * The listing decides who is asked, so a provider that is not llama.cpp costs no extra request.
 */
function isLlamaCppListing(models: readonly UpstreamModel[]): boolean {
  return models.some((model) => {
    const hasTrainedWindow = isRecord(model.meta) && model.meta.n_ctx_train !== undefined;
    return model.owned_by === LLAMA_CPP_OWNER || hasTrainedWindow;
  });
}

/**
 * Tells whether a model's `/props` may be asked for without starting it.
 *
 * @param model - One entry of a llama.cpp listing.
 * @returns False for a router's model that is not loaded; true for one that is, and for a single-model server's.
 */
function isRunning(model: UpstreamModel): boolean {
  const hasStatus = isRecord(model.status);
  return hasStatus === false || (isRecord(model.status) && model.status.value === LOADED_STATUS);
}

/**
 * Asks a llama.cpp provider which window it serves a model in.
 *
 * @param fetch - Reaches the provider.
 * @param provider - The provider.
 * @param upstreamId - The model's id at the provider.
 * @param timeoutMs - How long the provider may take to answer.
 * @returns `default_generation_settings.n_ctx`, or 0 when the provider did not say. Never rejects.
 */
async function readServedWindow(
  fetch: UpstreamFetch,
  provider: ProviderConfig,
  upstreamId: string,
  timeoutMs: number,
): Promise<number> {
  try {
    const answer = await fetchWithin(fetch, propsUrl(provider, upstreamId), {
      method: 'GET',
      headers: providerHeaders(provider),
      timeoutMs,
    });
    if (answer.ok === false) {
      return 0;
    }
    const props: unknown = JSON.parse(await answer.text());
    const settings = isRecord(props) ? props.default_generation_settings : undefined;
    const window = isRecord(settings) ? settings.n_ctx : undefined;
    const isWindow = typeof window === 'number' && Number.isInteger(window) && window > 0;
    return isWindow ? window : 0;
  } catch {
    return 0;
  }
}

/**
 * Puts the window each model is served in on a llama.cpp provider's listing, as `context_length`.
 *
 * @param fetch - Reaches the provider.
 * @param provider - The provider.
 * @param models - Its listing.
 * @param timeoutMs - How long each `/props` may take.
 * @returns The listing, each running model with `context_length` from `/props` where the provider said one and the
 * entry did not already state one. The same listing when the provider is not llama.cpp. Never rejects.
 *
 * @remarks
 * llama.cpp lists the window a model was trained with (`meta.n_ctx_train`) and serves it in the one it was started
 * with, often far smaller; a client that sizes requests by the first overflows the second. A router's model that is
 * not loaded is not asked, since asking could start it.
 */
export async function withServedWindows(
  fetch: UpstreamFetch,
  provider: ProviderConfig,
  models: UpstreamModel[],
  timeoutMs: number,
): Promise<UpstreamModel[]> {
  if (isLlamaCppListing(models) === false) {
    return models;
  }
  return Promise.all(
    models.map(async (model) => {
      const hasStatedWindow = model[CONTEXT_LENGTH_KEY] !== undefined;
      if (hasStatedWindow || isRunning(model) === false) {
        return model;
      }
      const window = await readServedWindow(fetch, provider, model.id, timeoutMs);
      return window > 0 ? { ...model, [CONTEXT_LENGTH_KEY]: window } : model;
    }),
  );
}
