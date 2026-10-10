import {
  createWorkspaceRequestSchema,
  HttpStatus,
  type ModelsResponse,
  providerNameSchema,
  slugify,
  updateWorkspaceRequestSchema,
  type WorkspaceConfig,
  type WorkspaceStatus,
  workspaceConfigSchema,
} from '@llm-router/shared';
import { Router } from 'express';
import { badInput, conflict, notFound } from '../../core/errors.ts';
import { workspaceScope } from '../../gateway/endpoint-scope.ts';
import { listScopeModels } from '../../gateway/models.ts';
import type { ApiDeps } from '../deps.ts';

/**
 * Names the path of a workspace's OpenAI base URL.
 *
 * @param slug - The workspace's slug.
 * @returns `/w/<slug>/v1`.
 */
export function workspacePath(slug: string): string {
  return `/w/${slug}/v1`;
}

/**
 * Builds workspace CRUD and each workspace's merged model listing, mounted at /api/workspaces.
 *
 * @param deps.store - Holds the workspace and provider configs.
 * @param deps.catalog - Lists each member's models.
 * @param deps.usage - Holds each workspace's counts, which follow a rename and outlive a delete.
 * @returns The router, with paths relative to /api/workspaces.
 */
export function createWorkspaceRoutes({ store, catalog, usage }: ApiDeps): Router {
  const router = Router();

  const toWorkspaceStatus = (workspace: WorkspaceConfig): WorkspaceStatus => ({
    ...workspace,
    path: workspacePath(workspace.slug),
  });

  const requireWorkspace = (slug: string): WorkspaceConfig => {
    const workspace = store.getWorkspace(slug);
    if (!workspace) {
      throw notFound(`Unknown workspace "${slug}"`);
    }
    return workspace;
  };

  /** Every member must reference a provider that currently exists. */
  const assertMembersExist = (members: Record<string, unknown> | undefined): void => {
    for (const name of Object.keys(members ?? {})) {
      if (!store.getProvider(name)) {
        throw badInput(`Unknown provider "${name}" in workspace members`);
      }
    }
  };

  const requireValidSlug = (slug: string): string => {
    const parsed = providerNameSchema.safeParse(slug);
    if (parsed.success === false) {
      throw badInput(`Invalid workspace slug "${slug}"`, 'derive a name that yields a valid URL slug');
    }
    return parsed.data;
  };

  router.get('/', (_req, res) => {
    res.json(store.getWorkspaces().map(toWorkspaceStatus));
  });

  router.post('/', async (req, res) => {
    const request = createWorkspaceRequestSchema.parse(req.body);
    const slug = requireValidSlug(request.slug ?? slugify(request.name));
    if (store.getWorkspace(slug)) {
      throw conflict(`Workspace "${slug}" already exists`);
    }
    assertMembersExist(request.members);
    const config = workspaceConfigSchema.parse({
      name: request.name,
      slug,
      enabled: request.enabled ?? true,
      description: request.description || undefined,
      members: request.members ?? {},
    });
    await store.saveWorkspace(config);
    res.status(HttpStatus.Created).json(toWorkspaceStatus(config));
  });

  router.get('/:slug', (req, res) => {
    res.json(toWorkspaceStatus(requireWorkspace(req.params.slug)));
  });

  router.patch('/:slug', async (req, res) => {
    const existing = requireWorkspace(req.params.slug);
    const update = updateWorkspaceRequestSchema.parse(req.body);
    assertMembersExist(update.members);
    // Renaming re-derives the slug, and so the URL. An unchanged name keeps it, so a member edit never moves the URL.
    const name = update.name ?? existing.name;
    const isRenamed = update.name !== undefined && update.name !== existing.name;
    const slug = isRenamed ? requireValidSlug(slugify(name)) : existing.slug;
    if (slug !== existing.slug && store.getWorkspace(slug)) {
      throw conflict(`Workspace "${slug}" already exists`);
    }
    const next = workspaceConfigSchema.parse({
      ...existing,
      name,
      slug,
      enabled: update.enabled ?? existing.enabled,
      // An empty description clears it; one left out keeps the stored one.
      description: update.description === undefined ? existing.description : update.description || undefined,
      members: update.members ?? existing.members,
    });
    await store.saveWorkspace(next);
    if (slug !== existing.slug) {
      await store.deleteWorkspace(existing.slug);
      usage.renameWorkspace(existing.slug, slug);
    }
    res.json(toWorkspaceStatus(next));
  });

  router.delete('/:slug', async (req, res) => {
    requireWorkspace(req.params.slug);
    await store.deleteWorkspace(req.params.slug);
    usage.releaseWorkspace(req.params.slug);
    res.status(HttpStatus.NoContent).end();
  });

  router.get('/:slug/models', async (req, res) => {
    const workspace = requireWorkspace(req.params.slug);
    const { models, skipped } = await listScopeModels(workspaceScope(workspace, store), catalog);
    const body: ModelsResponse = {
      models: models.map(({ id, provider, upstreamId }) => ({ id, provider, upstreamId })),
      skipped,
    };
    res.json(body);
  });

  return router;
}
