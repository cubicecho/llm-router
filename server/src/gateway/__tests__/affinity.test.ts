import { describe, expect, it } from 'vitest';
import { affinityKey } from '../affinity.ts';

const SYSTEM = { role: 'system', content: 'You are terse.' };
const FIRST_QUESTION = { role: 'user', content: 'Plan the trip.' };

describe('affinityKey', () => {
  it('takes the session header first', () => {
    expect(affinityKey({ prompt_cache_key: 'cache', user: 'u' }, 'session')).toBe('session');
  });

  it('takes prompt_cache_key before user', () => {
    expect(affinityKey({ prompt_cache_key: 'cache', user: 'u' }, undefined)).toBe('cache');
    expect(affinityKey({ user: 'u' }, undefined)).toBe('u');
  });

  it('gives a conversation the same key as it grows', () => {
    const opening = affinityKey({ messages: [SYSTEM, FIRST_QUESTION] }, undefined);
    const later = affinityKey(
      {
        messages: [
          SYSTEM,
          FIRST_QUESTION,
          { role: 'assistant', content: 'Where to?' },
          { role: 'user', content: 'Oslo.' },
        ],
      },
      undefined,
    );

    expect(later).toBe(opening);
  });

  it('gives conversations that open differently different keys', () => {
    const one = affinityKey({ messages: [SYSTEM, FIRST_QUESTION] }, undefined);
    const other = affinityKey({ messages: [SYSTEM, { role: 'user', content: 'Write a poem.' }] }, undefined);

    expect(other).not.toBe(one);
  });

  it('reads a completion prompt or an embedding input', () => {
    expect(affinityKey({ prompt: 'Once upon' }, undefined)).toBe('Once upon');
    expect(affinityKey({ input: ['a', 'b'] }, undefined)).toBe('["a","b"]');
  });

  it('has no key for a body without one', () => {
    expect(affinityKey({ model: 'llama' }, undefined)).toBeUndefined();
  });
});
