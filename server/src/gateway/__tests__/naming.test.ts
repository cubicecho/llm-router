import { describe, expect, it } from 'vitest';
import { namespaceModel, splitNamespacedModel } from '../naming.ts';

describe('model naming', () => {
  it('prefixes a model with its provider', () => {
    expect(namespaceModel('ollama', 'qwen3:32b')).toBe('ollama/qwen3:32b');
  });

  it('splits at the first slash, so an upstream id keeps its own', () => {
    expect(splitNamespacedModel('openrouter/anthropic/claude', ['openrouter'])).toEqual({
      providerName: 'openrouter',
      upstreamId: 'anthropic/claude',
    });
  });

  it('rejects an id with no prefix, an unknown provider or nothing after the slash', () => {
    expect(splitNamespacedModel('gpt-4o', ['openai'])).toBeUndefined();
    expect(splitNamespacedModel('nope/gpt-4o', ['openai'])).toBeUndefined();
    expect(splitNamespacedModel('openai/', ['openai'])).toBeUndefined();
    expect(splitNamespacedModel('/gpt-4o', ['openai'])).toBeUndefined();
  });
});
