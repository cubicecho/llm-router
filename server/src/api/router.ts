import { Router } from 'express';
import type { ApiDeps } from './deps.ts';
import { createPoolRoutes } from './routes/pools.ts';
import { createProviderRoutes } from './routes/providers.ts';
import { createSystemRoutes } from './routes/system.ts';
import { createUsageRoutes } from './routes/usage.ts';
import { createWorkspaceRoutes } from './routes/workspaces.ts';

export type { ApiDeps } from './deps.ts';

/**
 * Builds the REST API mounted at /api, assembled from one router per resource.
 *
 * @param deps - Handed whole to every route module.
 * @returns The router, with paths relative to /api.
 *
 * @remarks
 * Each sub-router owns its own path prefix, so its routes are written relative to it.
 */
export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();
  router.use(createSystemRoutes(deps));
  router.use('/providers', createProviderRoutes(deps));
  router.use('/workspaces', createWorkspaceRoutes(deps));
  router.use('/pools', createPoolRoutes(deps));
  router.use('/usage', createUsageRoutes(deps));
  return router;
}
