import { existsSync } from 'node:fs';
import path from 'node:path';
import { GLOBAL_ENDPOINT_PATH, type Health, WORKSPACE_PATH_PREFIX, workspaceEndpointPath } from '@llm-router/shared';
import express from 'express';
import { errorMiddleware } from '../api/error-middleware.ts';
import { createApiRouter } from '../api/router.ts';
import { createAuthMiddleware, createOriginMiddleware } from '../auth/middleware.ts';
import { effectiveAuth } from '../config/effective-auth.ts';
import type { ConfigStore } from '../config/store.ts';
import { HTTP_DEFAULTS } from '../core/defaults.ts';
import { notFound } from '../core/errors.ts';
import { SERVER_VERSION } from '../core/version.ts';
import { PoolBalancer } from '../gateway/balancer.ts';
import { globalScope, workspaceScope } from '../gateway/endpoint-scope.ts';
import { ModelCatalog } from '../gateway/models.ts';
import { openAiErrorMiddleware, sendOpenAiError } from '../gateway/openai-error.ts';
import { createEndpointRouter } from '../gateway/routes.ts';
import type { UpstreamFetch } from '../gateway/upstream-fetch.ts';
import { UsageStore } from '../usage/store.ts';
import { outboundFetch } from './tuning.ts';

/** Path prefixes the backend answers; the web UI's fallback leaves them alone. */
const BACKEND_PATH_PREFIXES = ['/api', GLOBAL_ENDPOINT_PATH, `${WORKSPACE_PATH_PREFIX}/`, '/healthz'] as const;

/** The route parameter that carries a workspace's slug. */
const SLUG_PARAM = 'slug';

/** What the Express app is built over. */
export interface AppDeps {
  store: ConfigStore;
  /** Override for tests; a keep-alive `fetch` is made when absent. */
  fetch?: UpstreamFetch;
  /** Override for tests; a catalog over `fetch` is made when absent. */
  catalog?: ModelCatalog;
  /** The loaded usage counts. A test leaves it out and gets an empty store over the same data directory. */
  usage?: UsageStore;
  /** Override for tests; a balancer with nothing in flight when absent. */
  balancer?: PoolBalancer;
  /** Override for tests; `<repo>/app/dist` when absent. */
  appDistDir?: string;
}

/**
 * Builds the Express app (separate from listen() so tests can drive it with supertest).
 *
 * @param deps - The store, plus the test overrides.
 * @returns The app: /healthz, /api, /v1, /w/<slug>/v1, and the built web UI when its directory exists.
 */
export function createApp(deps: AppDeps): express.Express {
  const { store } = deps;
  const fetch = deps.fetch ?? outboundFetch();
  const catalog = deps.catalog ?? new ModelCatalog(fetch);
  const usage = deps.usage ?? new UsageStore(store.dataDir);
  const balancer = deps.balancer ?? new PoolBalancer();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: HTTP_DEFAULTS.bodyLimit }));

  const getAuth = () => effectiveAuth(store.getSettings());
  const getAllowedOrigins = () => store.getSettings().allowedOrigins;
  // The /v1 doors refuse in OpenAI's envelope, so a client SDK reports the reason.
  const openAiAuth = createAuthMiddleware(getAuth, sendOpenAiError);
  // Origin check first so a DNS-rebound browser request is rejected regardless of the bearer token
  // (which it cannot read anyway) — the one guard that still applies when SECURE_LOCAL_NET drops auth.
  const openAiOriginGuard = createOriginMiddleware(getAllowedOrigins, sendOpenAiError);

  // Before the auth middleware: Docker's healthcheck and a load balancer carry no token. It reads nothing the
  // router holds, so a healthy answer means only that the process is serving.
  app.get('/healthz', (_req, res) => {
    const health: Health = { ok: true, version: SERVER_VERSION };
    res.json(health);
  });

  app.use('/api', createAuthMiddleware(getAuth), createApiRouter({ store, catalog, usage, balancer }));

  const gateway = { store, catalog, fetch, usage, balancer };
  app.use(
    GLOBAL_ENDPOINT_PATH,
    openAiOriginGuard,
    openAiAuth,
    createEndpointRouter(gateway, () => globalScope(store)),
  );
  app.use(
    workspaceEndpointPath(`:${SLUG_PARAM}`),
    openAiOriginGuard,
    openAiAuth,
    createEndpointRouter(gateway, (req) => {
      const slug = req.params[SLUG_PARAM];
      const workspace = typeof slug === 'string' ? store.getWorkspace(slug) : undefined;
      const isUnserved = workspace === undefined || workspace.enabled === false;
      if (isUnserved) {
        throw notFound(`Unknown workspace "${slug}"`);
      }
      return workspaceScope(workspace, store);
    }),
  );

  // Production: serve the built web UI with an SPA fallback for non-API GETs.
  const appDist = deps.appDistDir ?? path.resolve(import.meta.dirname, '../../../app/dist');
  if (existsSync(appDist)) {
    app.use(express.static(appDist));
    app.use((req, res, next) => {
      const isBackendPath = BACKEND_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix));
      if (req.method === 'GET' && isBackendPath === false) {
        res.sendFile(path.join(appDist, 'index.html'));
        return;
      }
      next();
    });
  }

  app.use(GLOBAL_ENDPOINT_PATH, openAiErrorMiddleware);
  app.use(WORKSPACE_PATH_PREFIX, openAiErrorMiddleware);
  app.use(errorMiddleware);
  return app;
}
