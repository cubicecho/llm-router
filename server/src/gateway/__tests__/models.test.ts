import { ErrorCode, type ProviderConfig } from '@llm-router/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EndpointScope } from '../endpoint-scope.ts';
import { listScopeModels, ModelCatalog } from '../models.ts';
import type { UpstreamFetch } from '../upstream-fetch.ts';

const ALPHA: ProviderConfig = { name: 'alpha', enabled: true, baseUrl: 'http://alpha.test/v1', headers: {} };
const BETA: ProviderConfig = { name: 'beta', enabled: true, baseUrl: 'http://beta.test/v1', headers: {} };
const CACHE_SECONDS = 60;
const ERROR_BODY_MAX_CHARS = 10;
const NOT_FOUND = 404;

/** A provider that lists `ids`, and counts how often it was asked. */
function listing(ids: string[]): { fetch: UpstreamFetch; calls: () => number } {
  let calls = 0;
  return {
    fetch: async () => {
      calls += 1;
      return Response.json({ data: ids.map((id) => ({ id, owned_by: 'stub' })) });
    },
    calls: () => calls,
  };
}

describe('ModelCatalog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists a provider at <baseUrl>/models and keeps what it said about each model', async () => {
    const urls: string[] = [];
    const fetch: UpstreamFetch = async (url) => {
      urls.push(url);
      return Response.json({ data: [{ id: 'small', owned_by: 'stub' }] });
    };
    const models = await new ModelCatalog(fetch).list(ALPHA);
    expect(urls).toEqual(['http://alpha.test/v1/models']);
    expect(models).toEqual([{ id: 'small', owned_by: 'stub' }]);
  });

  it('reuses a listing until it is older than the cache time', async () => {
    const provider = listing(['small']);
    const catalog = new ModelCatalog(provider.fetch, { modelListCacheSeconds: CACHE_SECONDS });
    await catalog.list(ALPHA);
    vi.advanceTimersByTime((CACHE_SECONDS - 1) * 1000);
    await catalog.list(ALPHA);
    expect(provider.calls()).toBe(1);
    vi.advanceTimersByTime(2000);
    await catalog.list(ALPHA);
    expect(provider.calls()).toBe(2);
  });

  it('fetches again for a provider whose config was saved, and after forget', async () => {
    const provider = listing(['small']);
    const catalog = new ModelCatalog(provider.fetch);
    await catalog.list(ALPHA);
    await catalog.list({ ...ALPHA });
    expect(provider.calls()).toBe(2);
    catalog.forget(ALPHA.name);
    await catalog.list({ ...ALPHA });
    expect(provider.calls()).toBe(3);
  });

  it('does not keep a failed listing', async () => {
    let calls = 0;
    const fetch: UpstreamFetch = async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('connect ECONNREFUSED');
      }
      return Response.json({ data: [] });
    };
    const catalog = new ModelCatalog(fetch);
    await expect(catalog.list(ALPHA)).rejects.toMatchObject({ code: ErrorCode.UpstreamFailed });
    await expect(catalog.list(ALPHA)).resolves.toEqual([]);
  });

  it('reports a non-2xx answer as a 502, with only the start of its body', async () => {
    const fetch: UpstreamFetch = async () => new Response('0123456789-and-the-rest', { status: NOT_FOUND });
    const catalog = new ModelCatalog(fetch, { errorBodyMaxChars: ERROR_BODY_MAX_CHARS });
    await expect(catalog.list(ALPHA)).rejects.toMatchObject({
      code: ErrorCode.UpstreamFailed,
      detail: `http://alpha.test/v1/models answered ${NOT_FOUND}: 0123456789`,
    });
  });

  it('reports a body that is not a model list as a 502', async () => {
    for (const body of ['<html>', '{"models":[]}']) {
      const catalog = new ModelCatalog(async () => new Response(body));
      await expect(catalog.list(ALPHA)).rejects.toMatchObject({ code: ErrorCode.UpstreamFailed });
    }
  });
});

describe('listScopeModels', () => {
  it('merges the members in order, under routed ids, and leaves out what an allowlist hides', async () => {
    const fetch: UpstreamFetch = async (url) =>
      Response.json({ data: url.includes('alpha') ? [{ id: 'small' }, { id: 'large' }] : [{ id: 'org/embed' }] });
    const scope: EndpointScope = {
      label: 'the test endpoint',
      members: [{ provider: ALPHA, allowedModels: ['small'] }, { provider: BETA }],
      pools: [],
    };
    const { models, skipped } = await listScopeModels(scope, new ModelCatalog(fetch));
    expect(models.map(({ id, provider, upstreamId }) => ({ id, provider, upstreamId }))).toEqual([
      { id: 'alpha/small', provider: 'alpha', upstreamId: 'small' },
      { id: 'beta/org/embed', provider: 'beta', upstreamId: 'org/embed' },
    ]);
    expect(skipped).toEqual([]);
  });

  it('skips a member that cannot be listed and still lists the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch: UpstreamFetch = async (url) => {
      if (url.includes('alpha')) {
        throw new Error('connect ECONNREFUSED');
      }
      return Response.json({ data: [{ id: 'embed' }] });
    };
    const scope: EndpointScope = {
      label: 'the test endpoint',
      members: [{ provider: ALPHA }, { provider: BETA }],
      pools: [],
    };
    const { models, skipped } = await listScopeModels(scope, new ModelCatalog(fetch));
    expect(models.map((model) => model.id)).toEqual(['beta/embed']);
    expect(skipped).toMatchObject([{ provider: 'alpha' }]);
    vi.restoreAllMocks();
  });
});
