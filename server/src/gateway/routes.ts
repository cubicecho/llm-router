import { HttpStatus } from '@llm-router/shared';
import { type Request, Router } from 'express';
import type { ConfigStore } from '../config/store.ts';
import { notFound } from '../core/errors.ts';
import type { UsageStore } from '../usage/store.ts';
import type { PoolBalancer } from './balancer.ts';
import type { EndpointScope, ScopePool } from './endpoint-scope.ts';
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
  /** Counts each answered request and the tokens it reported. */
  usage: UsageStore;
  /** Picks the target of a request that names a pool. */
  balancer: PoolBalancer;
}

/** OpenAI's `object` for one model. */
const MODEL_OBJECT = 'model';
/** OpenAI's `object` for a list. */
const LIST_OBJECT = 'list';
/** The `owned_by` of a pool's model object. */
const POOL_OWNER = 'pool';

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
 * Renders a pool as OpenAI's model object.
 *
 * @param scopePool - The pool.
 * @returns A model object under the pool's name, owned by `pool`.
 */
function poolToOpenAiModel(scopePool: ScopePool): Record<string, unknown> {
  return { id: scopePool.pool.name, object: MODEL_OBJECT, created: 0, owned_by: POOL_OWNER };
}

/**
 * Lists everything an endpoint serves as OpenAI model objects.
 *
 * @param scope - The endpoint's members and pools.
 * @param catalog - Lists each provider.
 * @returns The pools that have a target to send to, then every member's models.
 */
async function listOpenAiModels(scope: EndpointScope, catalog: ModelCatalog): Promise<Record<string, unknown>[]> {
  const { models } = await listScopeModels(scope, catalog);
  const servedPools = scope.pools.filter((scopePool) => scopePool.candidates.length > 0);
  return [...servedPools.map(poolToOpenAiModel), ...models.map(toOpenAiModel)];
}

/**
 * Builds the OpenAI-compatible routes of one endpoint, with paths relative to its `/v1`.
 *
 * @param deps - The store, the model catalog, the provider `fetch`, usage and the pool balancer.
 * @param resolveScope - Works out the providers a request may reach; throws to refuse it.
 * @returns A router serving `GET /models`, `GET /models/<id>` and every JSON `POST`.
 */
export function createEndpointRouter(deps: GatewayDeps, resolveScope: (req: Request) => EndpointScope): Router {
  const { store, catalog, fetch, usage, balancer } = deps;
  const router = Router({ mergeParams: true });

  router.get('/models', async (req, res) => {
    res.json({ object: LIST_OBJECT, data: await listOpenAiModels(resolveScope(req), catalog) });
  });

  router.get('/models/*id', async (req, res) => {
    const id = req.params.id.join('/');
    const models = await listOpenAiModels(resolveScope(req), catalog);
    const model = models.find((candidate) => candidate.id === id);
    if (!model) {
      throw new ModelNotFoundError(id);
    }
    res.status(HttpStatus.Ok).json(model);
  });

  router.post('/*path', async (req, res) => {
    await proxyToProvider(
      {
        scope: resolveScope(req),
        pathSegments: req.params.path,
        fetch,
        usage,
        balancer,
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
