import {
  createProviderRequestSchema,
  HttpStatus,
  type ModelsResponse,
  type ProviderConfig,
  type ProviderStatus,
  providerConfigSchema,
  updateProviderRequestSchema,
} from '@llm-router/shared';
import { Router } from 'express';
import { conflict, notFound } from '../../core/errors.ts';
import { namespaceModel } from '../../gateway/naming.ts';
import type { ApiDeps } from '../deps.ts';
import { keptOrCleared } from './kept-or-cleared.ts';

/** The query value that asks for a fresh model listing instead of a cached one. */
const REFRESH_QUERY_VALUE = 'true';

/**
 * Renders a provider for the API, leaving its key out.
 *
 * @param provider - The stored config.
 * @returns The config without `apiKey`, plus whether one is stored.
 */
export function toProviderStatus(provider: ProviderConfig): ProviderStatus {
  const { apiKey, ...rest } = provider;
  return { ...rest, apiKeySet: Boolean(apiKey) };
}

/**
 * Builds provider CRUD and each provider's live model listing, mounted at /api/providers.
 *
 * @param deps.store - Holds the provider, workspace and pool configs.
 * @param deps.catalog - Lists a provider's models.
 * @param deps.usage - Holds each provider's counts; a deleted provider's are dropped.
 * @returns The router, with paths relative to /api/providers.
 */
export function createProviderRoutes({ store, catalog, usage }: ApiDeps): Router {
  const router = Router();

  const requireProvider = (name: string): ProviderConfig => {
    const provider = store.getProvider(name);
    if (!provider) {
      throw notFound(`Unknown provider "${name}"`);
    }
    return provider;
  };

  /** Takes a deleted provider out of every workspace, so one made later under its name does not join them unasked. */
  const removeFromWorkspaces = async (name: string): Promise<void> => {
    for (const workspace of store.getWorkspaces()) {
      if (name in workspace.members) {
        const { [name]: _removed, ...members } = workspace.members;
        await store.saveWorkspace({ ...workspace, members });
      }
    }
  };

  /** Takes a deleted provider's targets out of every pool, for the same reason. */
  const removeFromPools = async (name: string): Promise<void> => {
    for (const pool of store.getPools()) {
      const targets = pool.targets.filter((target) => target.provider !== name);
      const hadTarget = targets.length < pool.targets.length;
      if (hadTarget) {
        await store.savePool({ ...pool, targets });
      }
    }
  };

  router.get('/', (_req, res) => {
    res.json(store.getProviders().map(toProviderStatus));
  });

  router.post('/', async (req, res) => {
    const request = createProviderRequestSchema.parse(req.body);
    if (store.getProvider(request.name)) {
      throw conflict(`Provider "${request.name}" already exists`);
    }
    const saved = await store.saveProvider(
      providerConfigSchema.parse({
        ...request,
        displayName: request.displayName || undefined,
        description: request.description || undefined,
        apiKey: request.apiKey || undefined,
      }),
    );
    res.status(HttpStatus.Created).json(toProviderStatus(saved));
  });

  router.get('/:name', (req, res) => {
    res.json(toProviderStatus(requireProvider(req.params.name)));
  });

  router.patch('/:name', async (req, res) => {
    const existing = requireProvider(req.params.name);
    const update = updateProviderRequestSchema.parse(req.body);
    const saved = await store.saveProvider(
      providerConfigSchema.parse({
        ...existing,
        displayName: keptOrCleared(update.displayName, existing.displayName),
        description: keptOrCleared(update.description, existing.description),
        enabled: update.enabled ?? existing.enabled,
        baseUrl: update.baseUrl ?? existing.baseUrl,
        // The key is write-only, so this is the one way to remove it.
        apiKey: keptOrCleared(update.apiKey, existing.apiKey),
        headers: update.headers ?? existing.headers,
      }),
    );
    res.json(toProviderStatus(saved));
  });

  router.delete('/:name', async (req, res) => {
    const { name } = requireProvider(req.params.name);
    await store.deleteProvider(name);
    await removeFromWorkspaces(name);
    await removeFromPools(name);
    catalog.forget(name);
    usage.forgetProvider(name);
    res.status(HttpStatus.NoContent).end();
  });

  router.get('/:name/models', async (req, res) => {
    const provider = requireProvider(req.params.name);
    if (req.query.refresh === REFRESH_QUERY_VALUE) {
      catalog.forget(provider.name);
    }
    const upstreamModels = await catalog.list(provider);
    const body: ModelsResponse = {
      models: upstreamModels.map((model) => ({
        id: namespaceModel(provider.name, model.id),
        provider: provider.name,
        upstreamId: model.id,
      })),
      skipped: [],
    };
    res.json(body);
  });

  return router;
}
