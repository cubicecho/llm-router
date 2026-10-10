import type { UsageResponse } from '@llm-router/shared';
import { Router } from 'express';
import type { ApiDeps } from '../deps.ts';

/**
 * Builds the usage route, mounted at /api/usage.
 *
 * @param deps.usage - Holds the request and token counts.
 * @returns The router, with paths relative to /api/usage.
 */
export function createUsageRoutes({ usage }: ApiDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: UsageResponse = { providers: usage.snapshot() };
    res.json(body);
  });

  return router;
}
