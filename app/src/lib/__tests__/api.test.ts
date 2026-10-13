import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStatus } from '../api.ts';

/** Answers every fetch with one fixed response. */
function answerWith(response: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  );
}

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the request when a 2xx answer is not JSON', async () => {
    answerWith(new Response('<html>proxy login</html>', { headers: { 'Content-Type': 'text/html' } }));

    await expect(getStatus()).rejects.toThrow('Unexpected response from GET /api/status');
  });

  it('names the request when a 2xx answer has the wrong shape', async () => {
    answerWith(Response.json({ unexpected: true }));

    await expect(getStatus()).rejects.toThrow('Unexpected response from GET /api/status');
  });
});
