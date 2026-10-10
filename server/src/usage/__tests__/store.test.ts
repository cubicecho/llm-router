import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageStore } from '../store.ts';

const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;

describe('UsageStore', () => {
  let dataDir: string;
  let file: string;

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    dataDir = await mkdtemp(path.join(tmpdir(), 'llm-router-usage-'));
    file = path.join(dataDir, 'usage.json');
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('adds up counts per model and totals them per provider', () => {
    const store = new UsageStore(dataDir);
    store.record('ollama', 'qwen3', { inputTokens: 10, outputTokens: 4 });
    store.record('ollama', 'qwen3', { inputTokens: 5, outputTokens: 1 });
    store.record('ollama', 'gemma');
    expect(store.snapshot()).toEqual([
      {
        provider: 'ollama',
        requests: 3,
        inputTokens: 15,
        outputTokens: 5,
        models: [
          { upstreamId: 'gemma', requests: 1, inputTokens: 0, outputTokens: 0 },
          { upstreamId: 'qwen3', requests: 2, inputTokens: 15, outputTokens: 5 },
        ],
      },
    ]);
  });

  it('keeps counts across a restart, in a file only the owner can read', async () => {
    const first = new UsageStore(dataDir);
    await first.init();
    first.record('ollama', 'qwen3', { inputTokens: 10, outputTokens: 4 });
    await first.close();
    expect((await stat(file)).mode & PERMISSION_BITS).toBe(OWNER_ONLY);

    const second = new UsageStore(dataDir);
    await second.init();
    expect(second.snapshot()).toEqual(first.snapshot());
  });

  it('writes after the flush delay without being closed', async () => {
    const store = new UsageStore(dataDir, { flushDelayMs: 1 });
    await store.init();
    store.record('ollama', 'qwen3', { inputTokens: 1, outputTokens: 1 });
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(file, 'utf8')).providers.ollama.qwen3.requests).toBe(1);
    });
    await store.close();
  });

  it('forgets a provider', async () => {
    const store = new UsageStore(dataDir);
    await store.init();
    store.record('ollama', 'qwen3');
    store.record('openai', 'gpt');
    store.forget('ollama');
    await store.close();
    expect(store.snapshot().map((entry) => entry.provider)).toEqual(['openai']);
    expect(Object.keys(JSON.parse(await readFile(file, 'utf8')).providers)).toEqual(['openai']);
  });

  it('starts over when the file cannot be read', async () => {
    await writeFile(file, '{ not json');
    const store = new UsageStore(dataDir);
    await store.init();
    expect(store.snapshot()).toEqual([]);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
