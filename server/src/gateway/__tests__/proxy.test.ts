import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ErrorCode, HttpStatus, type ProviderConfig } from '@llm-router/shared';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageStore } from '../../usage/store.ts';
import type { EndpointScope } from '../endpoint-scope.ts';
import { ModelNotFoundError, openAiErrorMiddleware } from '../openai-error.ts';
import { proxyToProvider, routeBody, withStreamUsage } from '../proxy.ts';
import type { UpstreamFetch, UpstreamRequest } from '../upstream-fetch.ts';

const ALPHA: ProviderConfig = { name: 'alpha', enabled: true, baseUrl: 'http://alpha.test/v1', headers: {} };
const SCOPE: EndpointScope = { label: 'the test endpoint', members: [{ provider: ALPHA, allowedModels: ['small'] }] };
const CHAT_BODY = { model: 'alpha/small', messages: [] };
const RESPONSE_TIMEOUT_MS = 1000;
const TOO_MANY_REQUESTS = 429;

describe('routeBody', () => {
  it('finds the member and rewrites the model to the provider id', () => {
    const routed = routeBody(SCOPE, { model: 'alpha/small', temperature: 0 });
    expect(routed.member.provider).toBe(ALPHA);
    expect(routed.body).toEqual({ model: 'small', temperature: 0 });
  });

  it('refuses a body with no model string as a 400', () => {
    for (const body of [undefined, 'text', {}, { model: 7 }, { model: '' }]) {
      expect(() => routeBody(SCOPE, body)).toThrow(expect.objectContaining({ code: ErrorCode.BadUserInput }));
    }
  });

  it('refuses a model the endpoint does not serve', () => {
    for (const model of ['small', 'beta/small', 'alpha/large']) {
      expect(() => routeBody(SCOPE, { model })).toThrow(ModelNotFoundError);
    }
  });
});

describe('withStreamUsage', () => {
  it('asks a streamed completion for its token counts, keeping the other stream options', () => {
    const body = { model: 'small', stream: true, stream_options: { include_obfuscation: false } };
    expect(withStreamUsage('chat/completions', body)).toEqual({
      ...body,
      stream_options: { include_obfuscation: false, include_usage: true },
    });
  });

  it('leaves the body alone when the client already chose', () => {
    const body = { model: 'small', stream: true, stream_options: { include_usage: false } };
    expect(withStreamUsage('chat/completions', body)).toBe(body);
  });

  it('leaves a body that is not streamed, and any other path, alone', () => {
    const plain = { model: 'small' };
    const streamed = { model: 'small', stream: true };
    expect(withStreamUsage('chat/completions', plain)).toBe(plain);
    expect(withStreamUsage('embeddings', streamed)).toBe(streamed);
  });
});

describe('proxyToProvider', () => {
  let dataDir: string;
  let usage: UsageStore;
  let sent: { url: string; request: UpstreamRequest }[];

  /** Builds an app that proxies every POST, with a provider that answers through `answer`. */
  const proxyApp = (answer: UpstreamFetch, pathSegments?: readonly string[]): express.Express => {
    const fetch: UpstreamFetch = (url, upstreamRequest) => {
      sent.push({ url, request: upstreamRequest });
      return answer(url, upstreamRequest);
    };
    const app = express();
    app.use(express.json());
    app.post('/*path', async (req, res) => {
      const call = {
        scope: SCOPE,
        pathSegments: pathSegments ?? (req.params.path as string[]),
        fetch,
        responseTimeoutMs: RESPONSE_TIMEOUT_MS,
        usage,
      };
      await proxyToProvider(call, req, res);
    });
    app.use(openAiErrorMiddleware);
    return app;
  };
  const jsonAnswer: UpstreamFetch = async () => Response.json({ usage: { prompt_tokens: 3, completion_tokens: 2 } });

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    dataDir = await mkdtemp(path.join(tmpdir(), 'llm-router-proxy-'));
    usage = new UsageStore(dataDir);
    sent = [];
  });

  afterEach(async () => {
    await usage.close();
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('refuses a path with a dot segment before reaching the provider', async () => {
    const res = await request(proxyApp(jsonAnswer, ['chat', '..', 'admin']))
      .post('/chat')
      .send(CHAT_BODY);
    expect(res.status).toBe(HttpStatus.BadRequest);
    expect(sent).toEqual([]);
  });

  it('sends the path and the query string on under the provider base URL', async () => {
    await request(proxyApp(jsonAnswer)).post('/chat/completions?api-version=2').send(CHAT_BODY);
    expect(sent.map(({ url }) => url)).toEqual(['http://alpha.test/v1/chat/completions?api-version=2']);
    expect(JSON.parse(sent[0]?.request.body ?? '')).toEqual({ model: 'small', messages: [] });
  });

  it('passes the provider status and headers through, without the ones that describe its connection', async () => {
    const answer: UpstreamFetch = async () =>
      new Response('{"error":"slow down"}', {
        status: TOO_MANY_REQUESTS,
        headers: { 'content-type': 'application/json', 'x-request-id': 'abc', 'content-encoding': 'gzip' },
      });
    const res = await request(proxyApp(answer)).post('/chat/completions').send(CHAT_BODY);
    expect(res.status).toBe(TOO_MANY_REQUESTS);
    expect(res.body).toEqual({ error: 'slow down' });
    expect(res.headers['x-request-id']).toBe('abc');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(usage.snapshot().providers).toEqual([]);
  });

  it('counts an answer that has no body as a request', async () => {
    const answer: UpstreamFetch = async () => new Response(null, { status: HttpStatus.NoContent });
    const res = await request(proxyApp(answer)).post('/chat/completions').send(CHAT_BODY);
    expect(res.status).toBe(HttpStatus.NoContent);
    expect(usage.snapshot().providers).toMatchObject([{ provider: 'alpha', requests: 1, inputTokens: 0 }]);
  });

  it('cuts the connection when the stream breaks, and still counts the request', async () => {
    const encoder = new TextEncoder();
    let pulls = 0;
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(encoder.encode('data: {"delta":"a"}\n\n'));
          return;
        }
        controller.error(new Error('provider went away'));
      },
    });
    const answer: UpstreamFetch = async () =>
      new Response(broken, { headers: { 'content-type': 'text/event-stream' } });
    await expect(request(proxyApp(answer)).post('/chat/completions').send(CHAT_BODY)).rejects.toThrow();
    expect(usage.snapshot().providers).toMatchObject([{ provider: 'alpha', requests: 1 }]);
  });

  it('logs a provider stream that breaks', async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('provider went away'));
      },
    });
    const answer: UpstreamFetch = async () => new Response(broken);
    await expect(request(proxyApp(answer)).post('/chat/completions').send(CHAT_BODY)).rejects.toThrow();
    expect(console.warn).toHaveBeenCalledWith('[gateway] stream from provider "alpha" broke: provider went away');
  });

  it('logs nothing when the client leaves a stream', async () => {
    const encoder = new TextEncoder();
    // Ends the way a real fetch body does when its request is aborted.
    const answer: UpstreamFetch = async (_url, upstreamRequest) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"delta":"a"}\n\n'));
            upstreamRequest.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    const server: Server = createServer(proxyApp(answer));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const client = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CHAT_BODY),
      signal: client.signal,
    });
    await response.body?.getReader().read();
    client.abort();
    await vi.waitFor(() => expect(usage.snapshot().providers).toMatchObject([{ provider: 'alpha', requests: 1 }]));
    expect(console.warn).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('abandons the provider request when the client goes away', async () => {
    let providerSignal: AbortSignal | undefined;
    const never: UpstreamFetch = (_url, upstreamRequest) => {
      providerSignal = upstreamRequest.signal;
      return new Promise((_resolve, reject) => {
        upstreamRequest.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    };
    const server: Server = createServer(proxyApp(never));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const client = new AbortController();
    const call = fetch(`http://127.0.0.1:${port}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CHAT_BODY),
      signal: client.signal,
    });
    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    client.abort();
    await expect(call).rejects.toThrow();
    await vi.waitFor(() => expect(providerSignal?.aborted).toBe(true));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
