import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProviderConfig } from '@llm-router/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigStore } from '../store.ts';

const TEST_PROVIDER: ProviderConfig = {
  name: 'echo',
  enabled: true,
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'secret',
  headers: { 'X-Team': 'a' },
};

describe('ConfigStore', () => {
  let dataDir: string;
  let store: ConfigStore;
  beforeEach(async () => {
    // A developer's own .env must not decide whether a token is generated here.
    vi.stubEnv('LLM_ROUTER_TOKEN', undefined);
    vi.stubEnv('SECURE_LOCAL_NET', undefined);
    dataDir = await mkdtemp(path.join(tmpdir(), 'llm-router-test-'));
    store = new ConfigStore(dataDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('seeds settings with a generated auth token on first run', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await store.init();

    const settings = store.getSettings();
    expect(settings.authEnabled).toBe(true);
    expect(settings.authToken).toMatch(/^[0-9a-f]{64}$/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(settings.authToken as string));

    const settingsFile = path.join(dataDir, 'config', 'settings.json');
    const onDisk = JSON.parse(await readFile(settingsFile, 'utf8'));
    expect(onDisk.authToken).toBe(settings.authToken);
    const mode = (await stat(settingsFile)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('does not generate a token when LLM_ROUTER_TOKEN is set', async () => {
    vi.stubEnv('LLM_ROUTER_TOKEN', 'env-token');
    await store.init();
    expect(store.getSettings().authToken).toBeNull();
  });

  it('round-trips provider configs through disk and reload', async () => {
    await store.init();
    await store.saveProvider(TEST_PROVIDER);
    expect(store.getProvider('echo')?.apiKey).toBe('secret');

    const fresh = new ConfigStore(dataDir);
    await fresh.init();
    expect(fresh.getProvider('echo')).toEqual(TEST_PROVIDER);

    await fresh.deleteProvider('echo');
    const reloaded = await store.reload();
    expect(reloaded.providers).toHaveLength(0);
    await fresh.close();
  });

  it('preserves unknown keys in hand-edited provider files', async () => {
    await store.init();
    await writeFile(
      path.join(dataDir, 'config', 'providers', 'echo.json'),
      JSON.stringify({ ...TEST_PROVIDER, myNote: 'keep me' }),
    );
    await store.reload();
    const config = store.getProvider('echo') as ProviderConfig & { myNote?: string };
    expect(config.myNote).toBe('keep me');
    await store.saveProvider(config);
    const onDisk = JSON.parse(await readFile(path.join(dataDir, 'config', 'providers', 'echo.json'), 'utf8'));
    expect(onDisk.myNote).toBe('keep me');
  });

  it('skips invalid provider files with an error instead of failing the whole load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await store.init();
    await store.saveProvider(TEST_PROVIDER);
    await writeFile(path.join(dataDir, 'config', 'providers', 'broken.json'), '{ "name": "NOT VALID!!" }');
    await writeFile(path.join(dataDir, 'config', 'providers', 'not-json.json'), 'nope');
    await store.reload();
    expect(store.getProviders().map((s) => s.name)).toEqual(['echo']);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('does not keep a provider or workspace whose file could not be written', async () => {
    await store.init();
    // A directory where the file belongs makes the final rename fail.
    await mkdir(path.join(dataDir, 'config', 'providers', 'echo.json'));
    await mkdir(path.join(dataDir, 'config', 'workspaces', 'team.json'), { recursive: true });

    await expect(store.saveProvider(TEST_PROVIDER)).rejects.toThrow();
    expect(store.getProvider('echo')).toBeUndefined();

    await expect(store.saveWorkspace({ name: 'Team', slug: 'team', enabled: true, members: {} })).rejects.toThrow();
    expect(store.getWorkspace('team')).toBeUndefined();
  });

  it('deletes a provider whose file is not named after it, so a reload does not bring it back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.init();
    await writeFile(path.join(dataDir, 'config', 'providers', 'hand-named.json'), JSON.stringify(TEST_PROVIDER));
    await store.reload();
    expect(store.getProvider('echo')).toBeDefined();

    await store.deleteProvider('echo');
    await store.reload();
    expect(store.getProviders()).toEqual([]);
    expect(await readdir(path.join(dataDir, 'config', 'providers'))).toEqual([]);
  });

  it('saves a provider whose file is not named after it into its own file, leaving no second copy', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.init();
    await writeFile(path.join(dataDir, 'config', 'providers', 'hand-named.json'), JSON.stringify(TEST_PROVIDER));
    await store.reload();

    await store.saveProvider({ ...TEST_PROVIDER, enabled: false });
    expect(await readdir(path.join(dataDir, 'config', 'providers'))).toEqual(['echo.json']);
    await store.reload();
    expect(store.getProvider('echo')?.enabled).toBe(false);
  });

  it('deletes a workspace whose file is not named after it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.init();
    const dir = path.join(dataDir, 'config', 'workspaces');
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'hand-named.json'),
      JSON.stringify({ name: 'Team', slug: 'team', enabled: true, members: {} }),
    );
    await store.reload();
    expect(store.getWorkspace('team')).toBeDefined();

    await store.deleteWorkspace('team');
    await store.reload();
    expect(store.getWorkspaces()).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  it('throws a friendly error when settings.json is invalid', async () => {
    await store.init();
    await writeFile(path.join(dataDir, 'config', 'settings.json'), '{ "port": "not-a-number" }');
    await expect(store.reload()).rejects.toThrow(/settings\.json failed validation/);
  });
});
