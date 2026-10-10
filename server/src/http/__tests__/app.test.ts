import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ErrorCode } from '@llm-router/shared';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigStore } from '../../config/store.ts';
import { SERVER_VERSION } from '../../core/version.ts';
import { ModelCatalog } from '../../gateway/models.ts';
import type { UpstreamFetch } from '../../gateway/upstream-fetch.ts';
import { localDay } from '../../usage/day.ts';
import { createApp } from '../app.ts';

/** What a stub provider saw of one request. */
interface SeenRequest {
  path: string;
  authorization: string | undefined;
  extra: string | undefined;
  body: unknown;
}

/** A stand-in OpenAI-compatible provider on a loopback port. */
interface StubProvider {
  baseUrl: string;
  seen: SeenRequest[];
  close: () => Promise<void>;
}

/** Starts a provider that lists `models` and answers chat completions, streamed when asked. */
async function startProvider(models: string[]): Promise<StubProvider> {
  const seen: SeenRequest[] = [];
  const upstream = express();
  upstream.use(express.json());
  upstream.use((req, _res, next) => {
    seen.push({
      path: req.originalUrl,
      authorization: req.get('authorization'),
      extra: req.get('x-extra'),
      body: req.body,
    });
    next();
  });
  upstream.get('/v1/models', (_req, res) => {
    res.json({ object: 'list', data: models.map((id) => ({ id, object: 'model', created: 7, owned_by: 'stub' })) });
  });
  upstream.post('/v1/chat/completions', (req, res) => {
    if (req.body.model === 'broken') {
      res.status(429).json({ error: { message: 'slow down', type: 'rate_limit_error', param: null, code: 'rate' } });
      return;
    }
    if (req.body.stream === true) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ model: req.body.model, delta: 'a' })}\n\n`);
      if (req.body.stream_options?.include_usage === true) {
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.json({
      model: req.body.model,
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
      usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
    });
  });
  upstream.post('/v1/embeddings', (req, res) => {
    res.json({ model: req.body.model, data: [], usage: { prompt_tokens: 4, total_tokens: 4 } });
  });
  const server: Server = createServer(upstream);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    seen,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('LLM Router', () => {
  let dataDir: string;
  let store: ConfigStore;
  let token: string;
  let app: ReturnType<typeof createApp>;
  let alpha: StubProvider;
  let beta: StubProvider;

  const upstreamFetch: UpstreamFetch = (url, init) => fetch(url, init);
  const build = (fetchImpl: UpstreamFetch = upstreamFetch) =>
    createApp({
      store,
      fetch: fetchImpl,
      catalog: new ModelCatalog(fetchImpl, { modelListTimeoutMs: 500 }),
      appDistDir: path.join(dataDir, 'no-such-dist'),
    });
  const authed = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const addProvider = (body: Record<string, unknown>) => authed(request(app).post('/api/providers')).send(body);

  beforeEach(async () => {
    delete process.env.LLM_ROUTER_TOKEN;
    delete process.env.SECURE_LOCAL_NET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    dataDir = await mkdtemp(path.join(tmpdir(), 'llm-router-'));
    store = new ConfigStore(dataDir);
    await store.init();
    token = store.getSettings().authToken as string;
    alpha = await startProvider(['small', 'large', 'broken']);
    beta = await startProvider(['org/embed']);
    app = build();
  });

  afterEach(async () => {
    await alpha.close();
    await beta.close();
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('auth and health', () => {
    it('answers /healthz without a token', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, version: SERVER_VERSION });
    });

    it('requires the token on /api, in the /api envelope', async () => {
      const res = await request(app).get('/api/status');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(ErrorCode.Unauthenticated);
    });

    it('requires the token on /v1 and a workspace, in the OpenAI envelope', async () => {
      for (const url of ['/v1/models', '/w/any/v1/models']) {
        const res = await request(app).get(url);
        expect(res.status).toBe(401);
        expect(res.body.error).toMatchObject({ type: 'authentication_error', code: 'invalid_api_key' });
      }
    });

    it('refuses a browser origin that is not allowed on /v1', async () => {
      const res = await authed(request(app).get('/v1/models')).set('Origin', 'https://evil.example');
      expect(res.status).toBe(403);
      expect(res.body.error.type).toBe('permission_error');
    });
  });

  describe('providers', () => {
    it('never returns an API key, and stores it for upstream calls', async () => {
      const created = await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl, apiKey: 'sk-secret' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ name: 'alpha', apiKeySet: true, enabled: true });
      expect(JSON.stringify(created.body)).not.toContain('sk-secret');

      const list = await authed(request(app).get('/api/providers'));
      expect(JSON.stringify(list.body)).not.toContain('sk-secret');
      const one = await authed(request(app).get('/api/providers/alpha'));
      expect(JSON.stringify(one.body)).not.toContain('sk-secret');

      const file = await readFile(path.join(dataDir, 'config/providers/alpha.json'), 'utf8');
      expect(JSON.parse(file).apiKey).toBe('sk-secret');
    });

    it('keeps the key on an update that leaves it out, and removes it on null', async () => {
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl, apiKey: 'sk-secret' });
      const renamed = await authed(request(app).patch('/api/providers/alpha')).send({ displayName: 'Alpha' });
      expect(renamed.body).toMatchObject({ displayName: 'Alpha', apiKeySet: true });
      expect(store.getProvider('alpha')?.apiKey).toBe('sk-secret');

      const cleared = await authed(request(app).patch('/api/providers/alpha')).send({ apiKey: null });
      expect(cleared.body.apiKeySet).toBe(false);
      expect(store.getProvider('alpha')?.apiKey).toBeUndefined();
    });

    it('validates input and refuses a duplicate name', async () => {
      const bad = await addProvider({ name: 'Bad Name', baseUrl: 'ftp://x' });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toBe('Validation failed');
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl });
      const dup = await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl });
      expect(dup.status).toBe(409);
    });

    it('lists a provider’s models, sending its key and headers upstream', async () => {
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl, apiKey: 'sk-secret', headers: { 'X-Extra': 'yes' } });
      const res = await authed(request(app).get('/api/providers/alpha/models'));
      expect(res.status).toBe(200);
      expect(res.body.models).toContainEqual({ id: 'alpha/small', provider: 'alpha', upstreamId: 'small' });
      expect(alpha.seen[0]).toMatchObject({ path: '/v1/models', authorization: 'Bearer sk-secret', extra: 'yes' });
    });

    it('reports an unreachable provider as a 502', async () => {
      await addProvider({ name: 'dead', baseUrl: 'http://127.0.0.1:1/v1' });
      const res = await authed(request(app).get('/api/providers/dead/models'));
      expect(res.status).toBe(502);
      expect(res.body.code).toBe(ErrorCode.UpstreamFailed);
    });

    it('takes a deleted provider out of its workspaces', async () => {
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl });
      await authed(request(app).post('/api/workspaces')).send({ name: 'Team', members: { alpha: {} } });
      const deleted = await authed(request(app).delete('/api/providers/alpha'));
      expect(deleted.status).toBe(204);
      expect(store.getWorkspace('team')?.members).toEqual({});
    });
  });

  describe('workspaces', () => {
    it('creates, renames and deletes a workspace', async () => {
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl });
      const created = await authed(request(app).post('/api/workspaces')).send({
        name: 'My Team',
        members: { alpha: { models: ['small'] } },
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ slug: 'my-team', path: '/w/my-team/v1' });

      const unknownMember = await authed(request(app).patch('/api/workspaces/my-team')).send({ members: { nope: {} } });
      expect(unknownMember.status).toBe(400);

      const renamed = await authed(request(app).patch('/api/workspaces/my-team')).send({ name: 'Other' });
      expect(renamed.body.slug).toBe('other');
      expect((await authed(request(app).get('/api/workspaces/my-team'))).status).toBe(404);

      expect((await authed(request(app).delete('/api/workspaces/other'))).status).toBe(204);
      expect((await authed(request(app).get('/api/workspaces'))).body).toEqual([]);
    });
  });

  describe('model listing', () => {
    beforeEach(async () => {
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl });
      await addProvider({ name: 'beta', baseUrl: beta.baseUrl });
    });

    it('merges every enabled provider on /v1/models, with prefixed ids', async () => {
      const res = await authed(request(app).get('/v1/models'));
      expect(res.status).toBe(200);
      expect(res.body.object).toBe('list');
      expect(res.body.data.map((model: { id: string }) => model.id)).toEqual([
        'alpha/small',
        'alpha/large',
        'alpha/broken',
        'beta/org/embed',
      ]);
      expect(res.body.data[0]).toEqual({ id: 'alpha/small', object: 'model', created: 7, owned_by: 'alpha' });
    });

    it('leaves a disabled provider out', async () => {
      await authed(request(app).patch('/api/providers/beta')).send({ enabled: false });
      const res = await authed(request(app).get('/v1/models'));
      expect(res.body.data.map((model: { id: string }) => model.id)).not.toContain('beta/org/embed');
    });

    it('lists only a workspace’s members, filtered by each allowlist', async () => {
      await authed(request(app).post('/api/workspaces')).send({
        name: 'team',
        members: { alpha: { models: ['small'] }, beta: {} },
      });
      const res = await authed(request(app).get('/w/team/v1/models'));
      expect(res.body.data.map((model: { id: string }) => model.id)).toEqual(['alpha/small', 'beta/org/embed']);

      const one = await authed(request(app).get('/w/team/v1/models/beta/org/embed'));
      expect(one.body).toMatchObject({ id: 'beta/org/embed', owned_by: 'beta' });
      const hidden = await authed(request(app).get('/w/team/v1/models/alpha/large'));
      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe('model_not_found');
    });

    it('skips a member that cannot be listed, and says so on /api', async () => {
      await addProvider({ name: 'dead', baseUrl: 'http://127.0.0.1:1/v1' });
      await authed(request(app).post('/api/workspaces')).send({ name: 'team', members: { dead: {}, beta: {} } });
      const res = await authed(request(app).get('/w/team/v1/models'));
      expect(res.status).toBe(200);
      expect(res.body.data.map((model: { id: string }) => model.id)).toEqual(['beta/org/embed']);

      const api = await authed(request(app).get('/api/workspaces/team/models'));
      expect(api.body.models).toEqual([{ id: 'beta/org/embed', provider: 'beta', upstreamId: 'org/embed' }]);
      expect(api.body.skipped).toHaveLength(1);
      expect(api.body.skipped[0].provider).toBe('dead');
    });

    it('answers 404 for an unknown or disabled workspace', async () => {
      expect((await authed(request(app).get('/w/nope/v1/models'))).status).toBe(404);
      await authed(request(app).post('/api/workspaces')).send({ name: 'off', enabled: false });
      const res = await authed(request(app).get('/w/off/v1/models'));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });

    it('reuses a listing until the provider changes', async () => {
      await authed(request(app).get('/v1/models'));
      await authed(request(app).get('/v1/models'));
      expect(alpha.seen.filter((seen) => seen.path === '/v1/models')).toHaveLength(1);
      await authed(request(app).patch('/api/providers/alpha')).send({ description: 'changed' });
      await authed(request(app).get('/v1/models'));
      expect(alpha.seen.filter((seen) => seen.path === '/v1/models')).toHaveLength(2);
    });
  });

  describe('proxying', () => {
    beforeEach(async () => {
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl, apiKey: 'sk-alpha' });
      await addProvider({ name: 'beta', baseUrl: beta.baseUrl });
      await authed(request(app).post('/api/workspaces')).send({
        name: 'team',
        members: { alpha: { models: ['small', 'broken'] } },
      });
    });

    it('forwards a chat completion with the upstream id and the provider key', async () => {
      const res = await authed(request(app).post('/v1/chat/completions?trace=1')).send({
        model: 'alpha/large',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(res.status).toBe(200);
      expect(res.body.model).toBe('large');
      const sent = alpha.seen.at(-1);
      expect(sent).toMatchObject({ path: '/v1/chat/completions?trace=1', authorization: 'Bearer sk-alpha' });
      expect(sent?.body).toEqual({ model: 'large', messages: [{ role: 'user', content: 'hi' }] });
    });

    it('passes a stream through', async () => {
      const res = await authed(request(app).post('/w/team/v1/chat/completions')).send({
        model: 'alpha/small',
        stream: true,
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toBe(
        'data: {"model":"small","delta":"a"}\n\n' +
          'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n' +
          'data: [DONE]\n\n',
      );
      expect(alpha.seen.at(-1)?.body).toMatchObject({ stream_options: { include_usage: true } });
    });

    it('leaves a stream’s usage choice alone when the client made one', async () => {
      const res = await authed(request(app).post('/v1/chat/completions')).send({
        model: 'alpha/small',
        stream: true,
        stream_options: { include_usage: false },
      });
      expect(res.text).toBe('data: {"model":"small","delta":"a"}\n\ndata: [DONE]\n\n');
      expect(alpha.seen.at(-1)?.body).toMatchObject({ stream_options: { include_usage: false } });
    });

    it('passes a provider’s own error through untouched', async () => {
      const res = await authed(request(app).post('/w/team/v1/chat/completions')).send({ model: 'alpha/broken' });
      expect(res.status).toBe(429);
      expect(res.body.error).toMatchObject({ message: 'slow down', type: 'rate_limit_error' });
    });

    it('answers 404 model_not_found for a model outside the scope', async () => {
      const cases = [
        { url: '/v1/chat/completions', model: 'nope/x' },
        { url: '/v1/chat/completions', model: 'unprefixed' },
        { url: '/w/team/v1/chat/completions', model: 'alpha/large' },
        { url: '/w/team/v1/chat/completions', model: 'beta/org/embed' },
      ];
      for (const { url, model } of cases) {
        const res = await authed(request(app).post(url)).send({ model });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatchObject({ type: 'invalid_request_error', code: 'model_not_found' });
      }
    });

    it('answers 400 for a body without a model, and for malformed JSON', async () => {
      const missing = await authed(request(app).post('/v1/chat/completions')).send({ messages: [] });
      expect(missing.status).toBe(400);
      expect(missing.body.error.type).toBe('invalid_request_error');
      const malformed = await authed(request(app).post('/v1/chat/completions'))
        .set('Content-Type', 'application/json')
        .send('{nope');
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.type).toBe('invalid_request_error');
    });

    it('answers 502 when the provider cannot be reached', async () => {
      await addProvider({ name: 'dead', baseUrl: 'http://127.0.0.1:1/v1' });
      const res = await authed(request(app).post('/v1/chat/completions')).send({ model: 'dead/x' });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatchObject({ type: 'api_error', code: 'upstream_failed' });
    });

    it('answers 504 when the provider does not start answering in time', async () => {
      await store.updateSettings({ responseTimeoutMs: 30 });
      const never: UpstreamFetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      const res = await authed(request(build(never)).post('/v1/chat/completions')).send({ model: 'alpha/small' });
      expect(res.status).toBe(504);
      expect(res.body.error.code).toBe('upstream_timeout');
    });

    it('answers 404 for a GET it does not serve', async () => {
      const res = await authed(request(app).get('/v1/files'));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });
  });

  describe('usage', () => {
    const chat = (model: string, extra: Record<string, unknown> = {}, base = '/v1') =>
      authed(request(app).post(`${base}/chat/completions`)).send({ model, ...extra });
    const getUsage = async () => (await authed(request(app).get('/api/usage'))).body;
    const NOTHING = { providers: [], workspaces: [] };

    beforeEach(async () => {
      await addProvider({ name: 'alpha', baseUrl: alpha.baseUrl, apiKey: 'sk-alpha' });
      await addProvider({ name: 'beta', baseUrl: beta.baseUrl });
      await authed(request(app).post('/api/workspaces')).send({ name: 'Team', members: { alpha: {} } });
    });

    it('is empty before any request', async () => {
      expect(await getUsage()).toEqual(NOTHING);
    });

    it('adds up requests and reported tokens per model, per provider and per day', async () => {
      await chat('alpha/large');
      await chat('alpha/large');
      await chat('alpha/small', { stream: true });
      await authed(request(app).post('/v1/embeddings')).send({ model: 'beta/org/embed', input: 'x' });
      const day = localDay(new Date());

      expect(await getUsage()).toEqual({
        providers: [
          {
            provider: 'alpha',
            requests: 3,
            inputTokens: 27,
            outputTokens: 8,
            models: [
              { upstreamId: 'large', requests: 2, inputTokens: 22, outputTokens: 6 },
              { upstreamId: 'small', requests: 1, inputTokens: 5, outputTokens: 2 },
            ],
            days: [{ day, requests: 3, inputTokens: 27, outputTokens: 8 }],
          },
          {
            provider: 'beta',
            requests: 1,
            inputTokens: 4,
            outputTokens: 0,
            models: [{ upstreamId: 'org/embed', requests: 1, inputTokens: 4, outputTokens: 0 }],
            days: [{ day, requests: 1, inputTokens: 4, outputTokens: 0 }],
          },
        ],
        workspaces: [],
      });
    });

    it('counts a workspace’s requests under the workspace and under the provider', async () => {
      await chat('alpha/large', {}, '/w/team/v1');
      await chat('alpha/large');
      const day = localDay(new Date());

      const usage = await getUsage();
      expect(usage.providers).toMatchObject([{ provider: 'alpha', requests: 2, inputTokens: 22 }]);
      expect(usage.workspaces).toEqual([
        {
          workspace: 'team',
          requests: 1,
          inputTokens: 11,
          outputTokens: 3,
          models: [{ provider: 'alpha', upstreamId: 'large', requests: 1, inputTokens: 11, outputTokens: 3 }],
          days: [{ day, requests: 1, inputTokens: 11, outputTokens: 3 }],
        },
      ]);
    });

    it('moves a renamed workspace’s counts to its new slug, and a deleted one’s stay with the provider', async () => {
      await chat('alpha/large', {}, '/w/team/v1');
      await authed(request(app).patch('/api/workspaces/team')).send({ name: 'Research' });
      expect((await getUsage()).workspaces).toMatchObject([{ workspace: 'research', requests: 1 }]);

      await authed(request(app).delete('/api/workspaces/research'));
      const usage = await getUsage();
      expect(usage.workspaces).toEqual([]);
      expect(usage.providers).toMatchObject([{ provider: 'alpha', requests: 1 }]);
    });

    it('counts a request without tokens when the provider reports none', async () => {
      await chat('alpha/small', { stream: true, stream_options: { include_usage: false } });
      expect((await getUsage()).providers).toMatchObject([
        { provider: 'alpha', requests: 1, inputTokens: 0, outputTokens: 0 },
      ]);
    });

    it('does not count a provider’s error, or a request that never reached one', async () => {
      await chat('alpha/broken');
      await chat('ghost/model');
      expect(await getUsage()).toEqual(NOTHING);
    });

    it('drops a deleted provider’s counts', async () => {
      await chat('alpha/large', {}, '/w/team/v1');
      await authed(request(app).delete('/api/providers/alpha'));
      expect(await getUsage()).toEqual(NOTHING);
    });

    it('resets every count', async () => {
      await chat('alpha/large', {}, '/w/team/v1');
      const reset = await authed(request(app).delete('/api/usage'));
      expect(reset.status).toBe(204);
      expect(await getUsage()).toEqual(NOTHING);
    });

    it('requires the token to read and to reset', async () => {
      expect((await request(app).get('/api/usage')).status).toBe(401);
      expect((await request(app).delete('/api/usage')).status).toBe(401);
    });
  });
});
