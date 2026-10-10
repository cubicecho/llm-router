import type { Server } from 'node:http';
import { Agent, fetch } from 'undici';
import { keepAliveTimeoutMs, outboundKeepAliveTimeoutMs } from '../config/env.ts';
import type { UpstreamFetch } from '../gateway/upstream-fetch.ts';

/**
 * Keeps idle client connections open longer than Node's 5 s, so a request after a pause reuses one.
 *
 * @param server - The listening HTTP server; its `keepAliveTimeout` is set in place.
 * @param [env] - Source of `HTTP_KEEP_ALIVE_TIMEOUT_MS`; `0` never closes an idle connection.
 * @returns The timeout applied, in ms.
 */
export function tuneInbound(server: Server, env?: NodeJS.ProcessEnv): number {
  const timeoutMs = keepAliveTimeoutMs(env);
  server.keepAliveTimeout = timeoutMs;
  return timeoutMs;
}

/**
 * Builds the `fetch` the router reaches providers with.
 *
 * @param [env] - Source of `HTTP_OUTBOUND_KEEP_ALIVE_TIMEOUT_MS`; ignored unless a positive whole number.
 * @returns A `fetch` that keeps an idle connection longer than undici's 4 s and never times a response out itself.
 *
 * @remarks
 * undici gives up on headers and on a quiet body after 300 s each, which a long completion or a slow stream outlasts.
 * The router bounds the wait for headers itself (`responseTimeoutMs`), and a stream runs as long as it needs.
 */
export function outboundFetch(env?: NodeJS.ProcessEnv): UpstreamFetch {
  const dispatcher = new Agent({
    keepAliveTimeout: outboundKeepAliveTimeoutMs(env),
    headersTimeout: 0,
    bodyTimeout: 0,
  });
  return (url, request) => fetch(url, { ...request, dispatcher });
}
