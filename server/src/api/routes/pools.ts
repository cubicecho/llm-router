import {
  createPoolRequestSchema,
  HttpStatus,
  type PoolConfig,
  type PoolLoad,
  type PoolStatus,
  type PoolTarget,
  poolConfigSchema,
  updatePoolRequestSchema,
} from '@llm-router/shared';
import { Router } from 'express';
import { badInput, conflict, notFound } from '../../core/errors.ts';
import type { ApiDeps } from '../deps.ts';
import { keptOrCleared } from './kept-or-cleared.ts';

/**
 * Builds pool CRUD and each pool's live load, mounted at /api/pools.
 *
 * @param deps.store - Holds the pool, provider and workspace configs.
 * @param deps.balancer - Counts the requests in flight to each target.
 * @returns The router, with paths relative to /api/pools.
 */
export function createPoolRoutes({ store, balancer }: ApiDeps): Router {
  const router = Router();

  const requirePool = (name: string): PoolConfig => {
    const pool = store.getPool(name);
    if (!pool) {
      throw notFound(`Unknown pool "${name}"`);
    }
    return pool;
  };

  /** Every target must name a provider that currently exists. */
  const assertTargetsExist = (targets: readonly PoolTarget[] | undefined): void => {
    for (const target of targets ?? []) {
      if (!store.getProvider(target.provider)) {
        throw badInput(`Unknown provider "${target.provider}" in pool targets`);
      }
    }
  };

  /** Takes a deleted pool off every workspace, so one made later under its name is not served unasked. */
  const removeFromWorkspaces = async (name: string): Promise<void> => {
    for (const workspace of store.getWorkspaces()) {
      if (workspace.pools.includes(name)) {
        await store.saveWorkspace({ ...workspace, pools: workspace.pools.filter((pool) => pool !== name) });
      }
    }
  };

  router.get('/', (_req, res) => {
    const body: PoolStatus[] = store.getPools();
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const request = createPoolRequestSchema.parse(req.body);
    if (store.getPool(request.name)) {
      throw conflict(`Pool "${request.name}" already exists`);
    }
    assertTargetsExist(request.targets);
    const saved = await store.savePool(
      poolConfigSchema.parse({
        ...request,
        displayName: request.displayName || undefined,
        description: request.description || undefined,
      }),
    );
    res.status(HttpStatus.Created).json(saved);
  });

  router.get('/:name', (req, res) => {
    const body: PoolStatus = requirePool(req.params.name);
    res.json(body);
  });

  router.patch('/:name', async (req, res) => {
    const existing = requirePool(req.params.name);
    const update = updatePoolRequestSchema.parse(req.body);
    assertTargetsExist(update.targets);
    const isLoadFactorLeftOut = update.maxLoadFactor === undefined;
    const saved = await store.savePool(
      poolConfigSchema.parse({
        ...existing,
        displayName: keptOrCleared(update.displayName, existing.displayName),
        description: keptOrCleared(update.description, existing.description),
        enabled: update.enabled ?? existing.enabled,
        strategy: update.strategy ?? existing.strategy,
        affinity: update.affinity ?? existing.affinity,
        // Null turns bounded load off.
        maxLoadFactor: isLoadFactorLeftOut ? existing.maxLoadFactor : (update.maxLoadFactor ?? undefined),
        targets: update.targets ?? existing.targets,
      }),
    );
    res.json(saved);
  });

  router.delete('/:name', async (req, res) => {
    const { name } = requirePool(req.params.name);
    await store.deletePool(name);
    await removeFromWorkspaces(name);
    res.status(HttpStatus.NoContent).end();
  });

  router.get('/:name/load', (req, res) => {
    const pool = requirePool(req.params.name);
    const body: PoolLoad = {
      targets: pool.targets.map((target) => ({
        ...target,
        inFlight: balancer.inFlightTo(target.provider, target.model),
        available: store.getProvider(target.provider)?.enabled === true,
      })),
    };
    res.json(body);
  });

  return router;
}
