import {
  type EditableSettings,
  MS_PER_SECOND,
  type ReloadResponse,
  type RouterStatus,
  type SettingsFile,
  updateSettingsRequestSchema,
} from '@llm-router/shared';
import { Router } from 'express';
import { effectiveAuth } from '../../auth/middleware.ts';
import { SERVER_VERSION } from '../../core/version.ts';
import type { ApiDeps } from '../deps.ts';

/**
 * Picks the settings the UI may read and change.
 *
 * @param settings - The stored settings.
 * @returns The editable subset; never the token.
 */
function toEditableSettings(settings: SettingsFile): EditableSettings {
  return {
    responseTimeoutMs: settings.responseTimeoutMs,
    authEnabled: settings.authEnabled,
    allowedOrigins: settings.allowedOrigins,
  };
}

/**
 * Builds the router-wide endpoints: status, global settings, and a config reload.
 *
 * @param deps.store - Holds the settings and is what a reload re-reads.
 * @returns The router, with paths relative to /api; uptime counts from this call.
 */
export function createSystemRoutes({ store }: ApiDeps): Router {
  const startedAt = Date.now();
  const router = Router();

  router.get('/status', (_req, res) => {
    const status: RouterStatus = {
      version: SERVER_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / MS_PER_SECOND),
      providerCount: store.getProviders().length,
      workspaceCount: store.getWorkspaces().length,
      authEnabled: effectiveAuth(store.getSettings()).enabled,
    };
    res.json(status);
  });

  router.get('/settings', (_req, res) => {
    res.json(toEditableSettings(store.getSettings()));
  });

  router.patch('/settings', async (req, res) => {
    const patch = updateSettingsRequestSchema.parse(req.body);
    res.json(toEditableSettings(await store.updateSettings(patch)));
  });

  router.post('/reload', async (_req, res) => {
    const state = await store.reload();
    const reloaded: ReloadResponse = {
      reloaded: true,
      providerCount: state.providers.length,
      workspaceCount: state.workspaces.length,
    };
    res.json(reloaded);
  });

  return router;
}
