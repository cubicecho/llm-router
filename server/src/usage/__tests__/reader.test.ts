import { describe, expect, it } from 'vitest';
import { readUsage, UsageReader } from '../reader.ts';

const MAX_BYTES = 1024;
const encode = (text: string) => new TextEncoder().encode(text);

/** Feeds a body to a reader in the given pieces and returns what it found. */
function readBody(isEventStream: boolean, pieces: string[]) {
  const reader = new UsageReader(isEventStream, MAX_BYTES);
  for (const piece of pieces) {
    reader.push(encode(piece));
  }
  return reader.result();
}

describe('readUsage', () => {
  it('reads chat completion counts', () => {
    expect(readUsage({ usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } })).toEqual({
      inputTokens: 12,
      outputTokens: 5,
    });
  });

  it('reads responses API counts, at the top level and under response', () => {
    const expected = { inputTokens: 9, outputTokens: 4 };
    expect(readUsage({ usage: { input_tokens: 9, output_tokens: 4 } })).toEqual(expected);
    expect(
      readUsage({ type: 'response.completed', response: { usage: { input_tokens: 9, output_tokens: 4 } } }),
    ).toEqual(expected);
  });

  it('counts no output for an embedding', () => {
    expect(readUsage({ usage: { prompt_tokens: 8, total_tokens: 8 } })).toEqual({ inputTokens: 8, outputTokens: 0 });
  });

  it('finds nothing without usable counts', () => {
    expect(readUsage({ usage: null })).toBeUndefined();
    expect(readUsage({ usage: { prompt_tokens: '12' } })).toBeUndefined();
    expect(readUsage({ usage: { prompt_tokens: -1 } })).toBeUndefined();
    expect(readUsage({ choices: [] })).toBeUndefined();
    expect(readUsage('usage')).toBeUndefined();
  });
});

describe('UsageReader', () => {
  it('reads a JSON body that arrives in pieces', () => {
    const body = JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } });
    expect(readBody(false, [body.slice(0, 20), body.slice(20)])).toEqual({ inputTokens: 3, outputTokens: 2 });
  });

  it('gives up on a JSON body over the size limit', () => {
    const body = JSON.stringify({ pad: 'x'.repeat(MAX_BYTES), usage: { prompt_tokens: 3, completion_tokens: 2 } });
    expect(readBody(false, [body])).toBeUndefined();
  });

  it('finds nothing in a body that is not JSON', () => {
    expect(readBody(false, ['<html>'])).toBeUndefined();
  });

  it('reads the usage event of a stream, however the chunks fall', () => {
    const stream =
      'data: {"choices":[{"delta":{"content":"hi"}}],"usage":null}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":1}}\n\n' +
      'data: [DONE]\n\n';
    const expected = { inputTokens: 7, outputTokens: 1 };
    expect(readBody(true, [stream])).toEqual(expected);
    expect(readBody(true, [...stream])).toEqual(expected);
  });

  it('keeps the last report of a stream that repeats it', () => {
    const stream =
      'data: {"usage":{"prompt_tokens":7,"completion_tokens":1}}\n\n' +
      'data: {"usage":{"prompt_tokens":7,"completion_tokens":30}}\n\n';
    expect(readBody(true, [stream])).toEqual({ inputTokens: 7, outputTokens: 30 });
  });

  it('reads a responses API stream and a last line with no newline', () => {
    const stream =
      'event: response.completed\n' +
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":6,"output_tokens":2}}}';
    expect(readBody(true, [stream])).toEqual({ inputTokens: 6, outputTokens: 2 });
  });

  it('finds nothing in a stream that reports none', () => {
    expect(readBody(true, ['data: {"delta":"a"}\n\ndata: [DONE]\n\n'])).toBeUndefined();
  });
});
