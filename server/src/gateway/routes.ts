import { HttpStatus } from '@llm-router/shared';
import { type Request, Router } from 'express';
import type { ConfigStore } from '../config/store.ts';
import { notFound } from '../core/errors.ts';
import type { EndpointScope } from './endpoint-scope.ts';
import { listScopeModels, type ModelCatalog, type ScopedModel } from './models.ts';
import { ModelNotFoundError } from './openai-error.ts';
import { proxyToProvider } from './proxy.ts';
import type { UpstreamFetch } from './upstream-fetch.ts';

/** What the OpenAI-compatible routes are built over. */
export interface GatewayDeps {
  store: ConfigStore;
  catalog: ModelCatalog;
  /** Reaches the providers for proxied calls. */
  fetch: UpstreamFetch;
}

/** OpenAI's `object` for one model. */
const MODEL_OBJECT = 'model';
/** OpenAI's `object` for a list. */
const LIST_OBJECT = 'list';

/**
 * Renders a model as OpenAI's model object.
 *
 * @param model - The model, with what its provider said about it.
 * @returns The provider's object under the routed id, owned by the provider.
 */
function toOpenAiModel(model: ScopedModel): Record<string, unknown> {
  return { created: 0, ...model.upstream, id: model.id, object: MODEL_OBJECT, owned_by: model.provider };
}

/**
 * Builds the OpenAI-compatible routes of one endpoint, with paths relative to its `/v1`.
 *
 * @param deps - The store, the model catalog and the provider `fetch`.
 * @param resolveScope - Works out the providers a request may reach; throws to refuse it.
 * @returns A router serving `GET /models`, `GET /models/<id>` and every JSON `POST`.
 */
export function createEndpointRouter(deps: GatewayDeps, resolveScope: (req: Request) => EndpointScope): Router {
  const { store, catalog, fetch } = deps;
  const router = Router({ mergeParams: true });

  router.get('/models', async (req, res) => {
    const { models } = await listScopeModels(resolveScope(req), catalog);
    res.json({ object: LIST_OBJECT, data: models.map(toOpenAiModel) });
  });

  router.get('/models/*id', async (req, res) => {
    const id = req.params.id.join('/');
    const { models } = await listScopeModels(resolveScope(req), catalog);
    const model = models.find((candidate) => candidate.id === id);
    if (!model) {
      throw new ModelNotFoundError(id);
    }
    res.status(HttpStatus.Ok).json(toOpenAiModel(model));
  });

  router.post('/*path', async (req, res) => {
    await proxyToProvider(
      {
        scope: resolveScope(req),
        pathSegments: req.params.path,
        fetch,
        responseTimeoutMs: store.getSettings().responseTimeoutMs,
      },
      req,
      res,
    );
  });

  router.use((req) => {
    throw notFound(
      `${req.method} ${req.originalUrl} is not served. This endpoint lists models and forwards JSON POSTs.`,
    );
  });

  return router;
}
