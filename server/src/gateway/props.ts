import type { Request, RequestHandler } from 'express';
import type { ConfigStore } from '../config/store.ts';
import { badInput, errorMessage, HttpError, upstreamFailed } from '../core/errors.ts';
import type { EndpointScope } from './endpoint-scope.ts';
import { ModelNotFoundError } from './openai-error.ts';
import { JSON_CONTENT_TYPE, providerHeaders } from './provider-headers.ts';
import { findServedModel, responseHeader } from './proxy.ts';
import { PROPS_PATH, propsUrl } from './served-window.ts';
import { fetchWithin, type UpstreamFetch } from './upstream-fetch.ts';

/** What the forwarded `/props` is built over. */
export interface PropsDeps {
  /** Read for `responseTimeoutMs`. */
  store: ConfigStore;
  /** Reaches the providers. */
  fetch: UpstreamFetch;
}

/**
 * Builds the handler of `GET /props?model=<provider>/<model>`, which forwards to that provider's own `/props`.
 *
 * @param deps - The store and the provider `fetch`.
 * @param resolveScope - Works out the providers a request may reach; throws to refuse it.
 * @returns The handler. It answers with the provider's status, content type and body.
 *
 * @remarks
 * A client that reads llama.cpp's served window asks `/props` at the root its base URL's `/v1` hangs off, so the
 * router answers it at `/props` and at `/w/<slug>/props`. The model names the provider, and is sent on as the
 * provider's own id, which a llama.cpp router reads and a single-model server ignores. A pool is not answered: its
 * targets may each serve a different window, and the listing already says each one's.
 */
export function createPropsHandler(deps: PropsDeps, resolveScope: (req: Request) => EndpointScope): RequestHandler {
  return async (req, res) => {
    const { model } = req.query;
    const namesModel = typeof model === 'string' && model !== '';
    if (namesModel === false) {
      throw badInput(`${PROPS_PATH} takes ?model=<provider>/<model>, the id the model is listed under`);
    }
    const served = findServedModel(resolveScope(req), model);
    if (served === undefined) {
      throw new ModelNotFoundError(model);
    }
    const { provider, upstreamId } = served;
    try {
      const answer = await fetchWithin(deps.fetch, propsUrl(provider, upstreamId), {
        method: 'GET',
        headers: providerHeaders(provider),
        timeoutMs: deps.store.getSettings().responseTimeoutMs,
      });
      const contentType = responseHeader(answer, 'content-type') || JSON_CONTENT_TYPE;
      res
        .status(answer.status)
        .type(contentType)
        .send(await answer.text());
    } catch (cause) {
      if (cause instanceof HttpError) {
        throw cause;
      }
      throw upstreamFailed(`Provider "${provider.name}" could not be reached`, errorMessage(cause), { cause });
    }
  };
}
