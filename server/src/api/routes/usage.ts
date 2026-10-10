import { HttpStatus, type UsageResponse } from '@llm-router/shared';
import { Router } from 'express';
import type { ApiDeps } from '../deps.ts';

/**
 * Builds the usage routes, mounted at /api/usage: reading the counts, and resetting them.
 *
 * @param deps.usage - Holds the request and token counts.
 * @returns The router, with paths relative to /api/usage.
 */
export function createUsageRoutes({ usage }: ApiDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: UsageResponse = usage.snapshot();
    res.json(body);
  });

  router.delete('/', (_req, res) => {
    usage.reset();
    res.status(HttpStatus.NoContent).end();
  });

  return router;
}
