import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { badInput, errorMessage, HttpError, upstreamFailed } from '../core/errors.ts';
import { isRecord } from '../core/is-record.ts';
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
 * provider request.
 */
export async function proxyToProvider(call: ProxyCall, req: Request, res: Response): Promise<void> {
  const { scope, pathSegments, fetch, responseTimeoutMs } = call;
  if (pathSegments.some((segment) => DOT_SEGMENTS.has(segment))) {
    throw badInput(`"${req.path}" is not a path this endpoint forwards`);
  }
  const { member, body } = routeBody(scope, req.body);
  const { provider } = member;
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
    res.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    // The head is sent, so there is no status left to report with: cut the connection and let the client see it.
    if (clientGone.signal.aborted === false) {
      console.warn(`[gateway] stream from provider "${provider.name}" broke: ${errorMessage(error)}`);
    }
    res.destroy();
  }
}
