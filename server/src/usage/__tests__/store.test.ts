import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDay, oldestDetailDay } from '../day.ts';
import { UsageStore } from '../store.ts';

const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;
const QWEN = { provider: 'ollama', upstreamId: 'qwen3' };
const ONE_CALL = { inputTokens: 10, outputTokens: 4 };
const ONE_CALL_COUNTED = { requests: 1, ...ONE_CALL };

describe('localDay', () => {
  it('names the day in the local time zone, zero-padded', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('counts the detail days back across a month, today included', () => {
    expect(oldestDetailDay(new Date(2026, 2, 2), 3)).toBe('2026-02-28');
    expect(oldestDetailDay(new Date(2026, 2, 2), 1)).toBe('2026-03-02');
  });
});

describe('UsageStore', () => {
  let dataDir: string;
  let file: string;
  let today: Date;
  const clock = () => today;

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    dataDir = await mkdtemp(path.join(tmpdir(), 'llm-router-usage-'));
    file = path.join(dataDir, 'usage.json');
    today = new Date(2026, 9, 10, 12);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('adds up counts per model and day, and totals them per provider', () => {
    const store = new UsageStore(dataDir, {}, clock);
    store.record(QWEN, ONE_CALL);
    store.record(QWEN, { inputTokens: 5, outputTokens: 1 });
    store.record({ provider: 'ollama', upstreamId: 'gemma' });
    today = new Date(2026, 9, 11, 9);
    store.record(QWEN, ONE_CALL);

    expect(store.snapshot()).toEqual({
      providers: [
        {
          provider: 'ollama',
          requests: 4,
          inputTokens: 25,
          outputTokens: 9,
          models: [
            { upstreamId: 'gemma', requests: 1, inputTokens: 0, outputTokens: 0 },
            { upstreamId: 'qwen3', requests: 3, inputTokens: 25, outputTokens: 9 },
          ],
          days: [
            { day: '2026-10-11', ...ONE_CALL_COUNTED },
            { day: '2026-10-10', requests: 3, inputTokens: 15, outputTokens: 5 },
          ],
        },
      ],
      workspaces: [],
    });
  });

  it('counts a workspace’s requests under it and under their providers', () => {
    const store = new UsageStore(dataDir, {}, clock);
    store.record({ ...QWEN, workspace: 'team' }, ONE_CALL);
    store.record({ provider: 'openai', upstreamId: 'gpt', workspace: 'team' }, ONE_CALL);
    store.record(QWEN, ONE_CALL);

    const { providers, workspaces } = store.snapshot();
    expect(providers.map(({ provider, requests }) => [provider, requests])).toEqual([
      ['ollama', 2],
      ['openai', 1],
    ]);
    expect(workspaces).toEqual([
      {
        workspace: 'team',
        requests: 2,
        inputTokens: 20,
        outputTokens: 8,
        models: [
          { provider: 'ollama', upstreamId: 'qwen3', ...ONE_CALL_COUNTED },
          { provider: 'openai', upstreamId: 'gpt', ...ONE_CALL_COUNTED },
        ],
        days: [{ day: '2026-10-10', requests: 2, inputTokens: 20, outputTokens: 8 }],
      },
    ]);
  });

  it('moves a renamed workspace’s counts, and leaves a deleted one’s with its providers', () => {
    const store = new UsageStore(dataDir, {}, clock);
    store.record({ ...QWEN, workspace: 'team' }, ONE_CALL);
    store.record(QWEN, ONE_CALL);

    store.renameWorkspace('team', 'research');
    expect(store.snapshot().workspaces.map(({ workspace, requests }) => [workspace, requests])).toEqual([
      ['research', 1],
    ]);

    store.releaseWorkspace('research');
    const { providers, workspaces } = store.snapshot();
    expect(workspaces).toEqual([]);
    expect(providers[0]).toMatchObject({
      requests: 2,
      inputTokens: 20,
      models: [{ upstreamId: 'qwen3', requests: 2 }],
    });
  });

  it('folds a day older than the detail days into the totals', () => {
    const store = new UsageStore(dataDir, { detailDays: 2 }, clock);
    store.record(QWEN, ONE_CALL);
    today = new Date(2026, 9, 11, 12);
    store.record(QWEN, ONE_CALL);
    today = new Date(2026, 9, 12, 12);
    store.record(QWEN, ONE_CALL);

    const [provider] = store.snapshot().providers;
    expect(provider).toMatchObject({ requests: 3, inputTokens: 30 });
    expect(provider?.days.map(({ day }) => day)).toEqual(['2026-10-12', '2026-10-11']);
  });

  it('keeps counts across a restart, in a file only the owner can read', async () => {
    const first = new UsageStore(dataDir, {}, clock);
    await first.init();
    first.record({ ...QWEN, workspace: 'team' }, ONE_CALL);
    await first.close();
    expect((await stat(file)).mode & PERMISSION_BITS).toBe(OWNER_ONLY);

    const second = new UsageStore(dataDir, {}, clock);
    await second.init();
    expect(second.snapshot()).toEqual(first.snapshot());
  });

  it('writes after the flush delay without being closed', async () => {
    const store = new UsageStore(dataDir, { flushDelayMs: 1 }, clock);
    await store.init();
    store.record(QWEN, ONE_CALL);
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(file, 'utf8')).entries).toEqual([
        { day: '2026-10-10', ...QWEN, ...ONE_CALL_COUNTED },
      ]);
    });
    await store.close();
  });

  it('forgets a provider', async () => {
    const store = new UsageStore(dataDir, {}, clock);
    await store.init();
    store.record(QWEN);
    store.record({ provider: 'openai', upstreamId: 'gpt' });
    store.forgetProvider('ollama');
    await store.close();
    expect(store.snapshot().providers.map((entry) => entry.provider)).toEqual(['openai']);
    expect(JSON.parse(await readFile(file, 'utf8')).entries).toHaveLength(1);
  });

  it('resets every count, on disk too', async () => {
    const store = new UsageStore(dataDir, {}, clock);
    await store.init();
    store.record({ ...QWEN, workspace: 'team' }, ONE_CALL);
    await store.close();
    store.reset();
    await store.close();
    expect(store.snapshot()).toEqual({ providers: [], workspaces: [] });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ entries: [] });
  });

  it('reads the file of the version before days and workspaces, as totals with no day', async () => {
    await writeFile(file, JSON.stringify({ providers: { ollama: { qwen3: { requests: 2, ...ONE_CALL } } } }));
    const store = new UsageStore(dataDir, {}, clock);
    await store.init();
    store.record(QWEN, ONE_CALL);
    expect(store.snapshot()).toEqual({
      providers: [
        {
          provider: 'ollama',
          requests: 3,
          inputTokens: 20,
          outputTokens: 8,
          models: [{ upstreamId: 'qwen3', requests: 3, inputTokens: 20, outputTokens: 8 }],
          days: [{ day: '2026-10-10', ...ONE_CALL_COUNTED }],
        },
      ],
      workspaces: [],
    });
  });

  it('starts over when the file cannot be read', async () => {
    await writeFile(file, '{ not json');
    const store = new UsageStore(dataDir);
    await store.init();
    expect(store.snapshot()).toEqual({ providers: [], workspaces: [] });
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
