import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { USAGE_DEFAULTS } from '../core/defaults.ts';
import { badInput, errorMessage, HttpError, upstreamFailed } from '../core/errors.ts';
import { isRecord } from '../core/is-record.ts';
import { UsageReader } from '../usage/reader.ts';
import type { UsageStore } from '../usage/store.ts';
import { type EndpointScope, exposesModel, type ScopeMember } from './endpoint-scope.ts';
import { splitNamespacedModel } from './naming.ts';
import { ModelNotFoundError } from './openai-error.ts';
import { providerHeaders } from './provider-headers.ts';
import { fetchWithin, type UpstreamFetch, type UpstreamResponse, upstreamUrl } from './upstream-fetch.ts';

/**
 * Response headers that describe the provider's connection or encoding, not the body the router sends on.
 * `fetch` has already decoded the body, so its length and encoding no longer hold.
 */
const UNFORWARDED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'proxy-authenticate',
  'trailer',
  'upgrade',
]);

/** Path segments that would walk a provider URL out of its base path. */
const DOT_SEGMENTS = new Set(['.', '..']);

/** Paths under `/v1` whose streams report token counts only when `stream_options.include_usage` asks for them. */
const STREAM_USAGE_PATHS = new Set(['chat/completions', 'completions']);

/** The content type of a server-sent event stream. */
const EVENT_STREAM_TYPE = 'text/event-stream';

/** What one proxied call needs. */
export interface ProxyCall {
  /** The providers the endpoint serves. */
  scope: EndpointScope;
  /** The path under `/v1`, one segment per entry, e.g. `['chat', 'completions']`. */
  pathSegments: readonly string[];
  /** Reaches the provider. */
  fetch: UpstreamFetch;
  /** How long the provider may take to send response headers, in ms. */
  responseTimeoutMs: number;
  /** Counts the request and the tokens the provider reports for it. */
  usage: UsageStore;
}

/** A request body matched to the provider that serves its model. */
interface RoutedBody {
  member: ScopeMember;
  /** The body to send on, its `model` set to the provider's own id. */
  body: Record<string, unknown>;
}

/**
 * Finds the scope member a request body's `model` names.
 *
 * @param scope - The endpoint's members.
 * @param body - The parsed request body.
 * @returns The member, and the body with `model` rewritten to the provider's id.
 * @throws A 400 HttpError when the body has no `model`; a ModelNotFoundError when the endpoint does not serve it.
 */
export function routeBody(scope: EndpointScope, body: unknown): RoutedBody {
  if (isRecord(body) === false || typeof body.model !== 'string' || body.model === '') {
    throw badInput('The request body must be a JSON object with a "model" string, as <provider>/<model>');
  }
  const split = splitNamespacedModel(
    body.model,
    scope.members.map((member) => member.provider.name),
  );
  const member = scope.members.find((candidate) => candidate.provider.name === split?.providerName);
  if (!split || !member || exposesModel(member, split.upstreamId) === false) {
    throw new ModelNotFoundError(body.model);
  }
  return { member, body: { ...body, model: split.upstreamId } };
}

/**
 * Asks for token counts at the end of a streamed completion, which providers leave out unless asked.
 *
 * @param path - The path under `/v1`, e.g. `chat/completions`.
 * @param body - The body about to be sent to the provider.
 * @returns The body with `stream_options.include_usage` on, or the same body when it is not a streamed completion or
 * the client already chose.
 */
export function withStreamUsage(path: string, body: Record<string, unknown>): Record<string, unknown> {
  if (STREAM_USAGE_PATHS.has(path) === false || body.stream !== true) {
    return body;
  }
  const options = isRecord(body.stream_options) ? body.stream_options : {};
  if (options.include_usage !== undefined) {
    return body;
  }
  return { ...body, stream_options: { ...options, include_usage: true } };
}

/**
 * Reads a response header.
 *
 * @param upstream - The provider's response.
 * @param wanted - The header's name, in lower case.
 * @returns The header's value, or an empty string when the response has none.
 */
function responseHeader(upstream: UpstreamResponse, wanted: string): string {
  let found = '';
  upstream.headers.forEach((value, name) => {
    if (name.toLowerCase() === wanted) {
      found = value;
    }
  });
  return found;
}

/**
 * Copies a provider's status and headers onto the client response, and sends them.
 *
 * @param upstream - The provider's response.
 * @param res - The client response; written in place.
 */
function forwardHead(upstream: UpstreamResponse, res: Response): void {
  res.status(upstream.status);
  upstream.headers.forEach((value, name) => {
    if (UNFORWARDED_RESPONSE_HEADERS.has(name.toLowerCase()) === false) {
      res.setHeader(name, value);
    }
  });
  // Sent now, so a stream's first event is not held back until the body has more to say.
  res.flushHeaders();
}

/**
 * Forwards one JSON request to the provider its `model` names and pipes the answer back, a stream included.
 *
 * @param call - The scope, the path under `/v1`, and how to reach the provider.
 * @param req - The client request, body already parsed.
 * @param res - The client response.
 * @throws An HttpError before anything is sent: 400 or 404 for the request, 502 or 504 for the provider.
 *
 * @remarks
 * The provider's own status and body pass through untouched, errors included. A client that goes away aborts the
 * provider request. A streamed completion is sent on with `stream_options.include_usage` on, so the provider ends the
 * stream with its token counts; every answered request is counted in `call.usage`.
 */
export async function proxyToProvider(call: ProxyCall, req: Request, res: Response): Promise<void> {
  const { scope, pathSegments, fetch, responseTimeoutMs, usage } = call;
  if (pathSegments.some((segment) => DOT_SEGMENTS.has(segment))) {
    throw badInput(`"${req.path}" is not a path this endpoint forwards`);
  }
  const routed = routeBody(scope, req.body);
  const { provider } = routed.member;
  const upstreamId = String(routed.body.model);
  const body = withStreamUsage(pathSegments.join('/'), routed.body);
  const path = pathSegments.map(encodeURIComponent).join('/');
  const { search } = new URL(req.originalUrl, 'http://router.invalid');
  const url = `${upstreamUrl(provider.baseUrl, path)}${search}`;

  const clientGone = new AbortController();
  res.on('close', () => {
    if (res.writableFinished === false) {
      clientGone.abort();
    }
  });

  let upstream: UpstreamResponse;
  try {
    upstream = await fetchWithin(fetch, url, {
      method: 'POST',
      headers: providerHeaders(provider, {
        accept: req.get('accept') ?? 'application/json',
        'content-type': 'application/json',
      }),
      body: JSON.stringify(body),
      signal: clientGone.signal,
      timeoutMs: responseTimeoutMs,
    });
  } catch (cause) {
    if (cause instanceof HttpError) {
      throw cause;
    }
    throw upstreamFailed(`Provider "${provider.name}" could not be reached`, errorMessage(cause), { cause });
  }

  forwardHead(upstream, res);
  if (upstream.body === null) {
    if (upstream.ok) {
      usage.record(provider.name, upstreamId);
    }
    res.end();
    return;
  }
  // The body is read for its token counts as it goes by; the bytes sent on are the provider's own.
  const reader = new UsageReader(
    responseHeader(upstream, 'content-type').includes(EVENT_STREAM_TYPE),
    USAGE_DEFAULTS.maxResponseBytes,
  );
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      reader.push(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(upstream.body), tap, res);
  } catch (error) {
    // The head is sent, so there is no status left to report with: cut the connection and let the client see it.
    if (clientGone.signal.aborted === false) {
      console.warn(`[gateway] stream from provider "${provider.name}" broke: ${errorMessage(error)}`);
    }
    res.destroy();
  } finally {
    // An answer that was cut short still cost what it had reported by then. A provider's error is not counted.
    if (upstream.ok) {
      usage.record(provider.name, upstreamId, reader.result());
    }
  }
}
