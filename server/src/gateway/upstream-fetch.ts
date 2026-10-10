import type { ReadableStream } from 'node:stream/web';
import { upstreamTimeout } from '../core/errors.ts';

/** What the router sends a provider. */
export interface UpstreamRequest {
  method: string;
  headers: Record<string, string>;
  /** A JSON document, already serialised. */
  body?: string;
  /** Abandons the request, and the response body after it. */
  signal?: AbortSignal;
}

/** The part of a provider's response the router reads. */
export interface UpstreamResponse {
  status: number;
  /** True for a 2xx status. */
  ok: boolean;
  headers: { forEach(callback: (value: string, name: string) => void): void };
  /** Null when the response has no body. */
  body: ReadableStream<Uint8Array> | null;
  /** Reads the whole body as text. */
  text(): Promise<string>;
}

/** The `fetch` the router reaches providers with; a test passes its own. */
export type UpstreamFetch = (url: string, request: UpstreamRequest) => Promise<UpstreamResponse>;

/** What a bounded request is given. */
export interface BoundedRequest extends UpstreamRequest {
  /** How long the provider may take to send response headers, in ms. */
  timeoutMs: number;
}

/**
 * Sends a request that is abandoned when the provider takes too long to start answering.
 *
 * @param fetch - Makes the request.
 * @param url - The provider URL.
 * @param request - The request, its header timeout, and an optional signal that also abandons it.
 * @returns The response, headers received. Its body is not bounded by the timeout.
 * @throws A 504 HttpError when the timeout passes first; whatever `fetch` throws otherwise.
 */
export async function fetchWithin(
  fetch: UpstreamFetch,
  url: string,
  request: BoundedRequest,
): Promise<UpstreamResponse> {
  const { timeoutMs, signal: callerSignal, ...rest } = request;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
  try {
    return await fetch(url, { ...rest, signal });
  } catch (cause) {
    if (deadline.signal.aborted) {
      throw upstreamTimeout(`No response from ${new URL(url).host} within ${timeoutMs} ms`, undefined, { cause });
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Joins a provider's base URL and a path under it.
 *
 * @param baseUrl - The provider's OpenAI base URL, with or without a trailing slash.
 * @param path - The path under it, without a leading slash, e.g. `chat/completions`.
 * @returns The full URL.
 */
export function upstreamUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path}`;
}
