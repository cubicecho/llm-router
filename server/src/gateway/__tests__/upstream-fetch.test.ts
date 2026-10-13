import { ErrorCode } from '@llm-router/shared';
import { describe, expect, it } from 'vitest';
import { fetchWithin, type UpstreamFetch, upstreamUrl } from '../upstream-fetch.ts';

const URL_UNDER_TEST = 'http://alpha.test/v1/models';
const SHORT_TIMEOUT_MS = 20;
const LONG_TIMEOUT_MS = 5000;

/** A provider that answers only by failing once its request is abandoned. */
const neverAnswers: UpstreamFetch = (_url, request) =>
  new Promise((_resolve, reject) => {
    request.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

describe('upstreamUrl', () => {
  it('joins a base URL and a path with one slash, whatever the base ends in', () => {
    expect(upstreamUrl('http://alpha.test/v1', 'models')).toBe(URL_UNDER_TEST);
    expect(upstreamUrl('http://alpha.test/v1/', 'models')).toBe(URL_UNDER_TEST);
    expect(upstreamUrl('http://alpha.test/v1//', 'chat/completions')).toBe('http://alpha.test/v1/chat/completions');
  });
});

describe('fetchWithin', () => {
  it('hands the request on without its timeout, and returns the answer', async () => {
    const seen: unknown[] = [];
    const answer = new Response('ok');
    const fetch: UpstreamFetch = async (url, request) => {
      seen.push({ url, method: request.method, headers: request.headers, hasSignal: request.signal !== undefined });
      return answer;
    };
    const result = await fetchWithin(fetch, URL_UNDER_TEST, {
      method: 'GET',
      headers: { accept: 'application/json' },
      timeoutMs: LONG_TIMEOUT_MS,
    });
    expect(result).toBe(answer);
    expect(seen).toEqual([
      { url: URL_UNDER_TEST, method: 'GET', headers: { accept: 'application/json' }, hasSignal: true },
    ]);
  });

  it('gives up with a 504 when the provider sends no headers in time', async () => {
    const call = fetchWithin(neverAnswers, URL_UNDER_TEST, { method: 'GET', headers: {}, timeoutMs: SHORT_TIMEOUT_MS });
    await expect(call).rejects.toMatchObject({ code: ErrorCode.UpstreamTimeout });
  });

  it('abandons the request when the caller does, and passes on what fetch threw', async () => {
    const caller = new AbortController();
    const call = fetchWithin(neverAnswers, URL_UNDER_TEST, {
      method: 'GET',
      headers: {},
      signal: caller.signal,
      timeoutMs: LONG_TIMEOUT_MS,
    });
    caller.abort();
    await expect(call).rejects.toThrow('aborted');
  });

  it('passes on a failure of fetch itself', async () => {
    const refused: UpstreamFetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const call = fetchWithin(refused, URL_UNDER_TEST, { method: 'GET', headers: {}, timeoutMs: LONG_TIMEOUT_MS });
    await expect(call).rejects.toThrow('connect ECONNREFUSED');
  });
});
