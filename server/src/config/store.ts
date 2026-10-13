import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type ProviderConfig,
  providerConfigSchema,
  type SettingsFile,
  settingsFileSchema,
  type WorkspaceConfig,
  workspaceConfigSchema,
} from '@llm-router/shared';
import { type FSWatcher, watch } from 'chokidar';
import { CONFIG_DEFAULTS } from '../core/defaults.ts';
import { errorMessage } from '../core/errors.ts';
import { writeJsonAtomic } from '../core/write-json-atomic.ts';
import { ConfigCollection } from './collection.ts';
import { effectiveAuth } from './effective-auth.ts';
import { parseConfigFile } from './parse-file.ts';

/** Everything the config files hold, as last loaded. */
export interface ConfigState {
  settings: SettingsFile;
  providers: ProviderConfig[];
  workspaces: WorkspaceConfig[];
}

/**
 * Owns the flat config files under DATA_DIR/config: settings.json, providers/<name>.json and
 * workspaces/<slug>.json.
 *
 * @remarks
 * All writes are atomic (tmp file + chmod 0600 + rename). Emits a typed 'change' event, debounced, when the files
 * change on disk while it is watching.
 */
export class ConfigStore extends EventEmitter<{ change: [ConfigState] }> {
  readonly dataDir: string;
  /** `<dataDir>/config`. */
  readonly configDir: string;
  /** `<configDir>/providers`, one file per provider. */
  readonly providersDir: string;
  /** `<configDir>/workspaces`, one file per workspace. */
  readonly workspacesDir: string;

  private settings: SettingsFile = settingsFileSchema.parse({});
  private readonly providers: ConfigCollection<ProviderConfig>;
  private readonly workspaces: ConfigCollection<WorkspaceConfig>;
  private watcher: FSWatcher | null = null;
  private watchDebounce: NodeJS.Timeout | null = null;

  /**
   * Works out the config paths; nothing is read or created until `init`.
   *
   * @param dataDir - The data directory; config lives in its `config` folder.
   */
  constructor(dataDir: string) {
    super();
    this.dataDir = dataDir;
    this.configDir = path.join(dataDir, 'config');
    this.providersDir = path.join(this.configDir, 'providers');
    this.workspacesDir = path.join(this.configDir, 'workspaces');
    this.providers = new ConfigCollection({
      dir: this.providersDir,
      kind: 'provider',
      keyField: 'name',
      parse: providerConfigSchema.parse.bind(providerConfigSchema),
      keyOf: (provider) => provider.name,
    });
    this.workspaces = new ConfigCollection({
      dir: this.workspacesDir,
      kind: 'workspace',
      keyField: 'slug',
      parse: workspaceConfigSchema.parse.bind(workspaceConfigSchema),
      keyOf: (workspace) => workspace.slug,
    });
  }

  /** Create directories, seed defaults on first run and load everything. */
  async init(): Promise<void> {
    await this.providers.init();
    await this.workspaces.init();
    await this.loadAll();
  }

  /**
   * Re-read every config file from disk.
   *
   * @returns The new state. Rejects when settings.json is invalid; a bad provider or workspace
   * file is logged and skipped.
   */
  async reload(): Promise<ConfigState> {
    await this.loadAll();
    return this.snapshot();
  }

  /** Start watching the config dir; emits 'change' (debounced) after reloading. A no-op when already watching. */
  startWatching(): void {
    if (this.watcher) {
      return;
    }
    this.watcher = watch(this.configDir, { ignoreInitial: true, depth: 2 });
    this.watcher.on('all', () => {
      if (this.watchDebounce) {
        clearTimeout(this.watchDebounce);
      }
      this.watchDebounce = setTimeout(() => {
        this.watchDebounce = null;
        this.reload()
          .then((state) => this.emit('change', state))
          .catch((err: unknown) => {
            console.error(`[config] reload after a file change failed: ${errorMessage(err)}`);
          });
      }, CONFIG_DEFAULTS.watchDebounceMs);
    });
  }

  /** Stop watching the config dir and drop any reload still waiting on the debounce. */
  async close(): Promise<void> {
    if (this.watchDebounce) {
      clearTimeout(this.watchDebounce);
      this.watchDebounce = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Reads everything held in memory at once.
   *
   * @returns The current state, with providers and workspaces sorted by name.
   */
  snapshot(): ConfigState {
    return {
      settings: this.settings,
      providers: this.getProviders(),
      workspaces: this.getWorkspaces(),
    };
  }

  /**
   * Reads the settings.
   *
   * @returns The settings as last loaded or saved.
   */
  getSettings(): SettingsFile {
    return this.settings;
  }

  /**
   * Lists the provider configs.
   *
   * @returns A new array, sorted by name.
   */
  getProviders(): ProviderConfig[] {
    return this.providers.values().sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Finds a provider config.
   *
   * @param name - The provider's name.
   * @returns The config, or undefined when there is none by that name.
   */
  getProvider(name: string): ProviderConfig | undefined {
    return this.providers.get(name);
  }

  /**
   * Merge a partial settings update, persist settings.json, and apply it in memory.
   *
   * @param patch - The fields to change; the rest keep their values.
   * @returns The merged settings. Throws, changing nothing, when the result fails validation.
   */
  async updateSettings(patch: Partial<SettingsFile>): Promise<SettingsFile> {
    const next = settingsFileSchema.parse({ ...this.settings, ...patch });
    await writeJsonAtomic(path.join(this.configDir, 'settings.json'), next);
    this.settings = next;
    return next;
  }

  /**
   * Creates or replaces a provider config, in memory and in its file.
   *
   * @param config - The config; its `name` is the key and the file name.
   * @returns The config as validated. Throws when it fails validation.
   */
  async saveProvider(config: ProviderConfig): Promise<ProviderConfig> {
    return this.providers.save(config);
  }

  /**
   * Removes a provider config, from memory and from disk.
   *
   * @param name - The provider's name; an unknown one is not an error.
   */
  async deleteProvider(name: string): Promise<void> {
    await this.providers.delete(name);
  }

  /**
   * Lists the workspace configs.
   *
   * @returns A new array, sorted by name.
   */
  getWorkspaces(): WorkspaceConfig[] {
    return this.workspaces.values().sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Finds a workspace config.
   *
   * @param slug - The workspace's slug.
   * @returns The config, or undefined when there is none by that slug.
   */
  getWorkspace(slug: string): WorkspaceConfig | undefined {
    return this.workspaces.get(slug);
  }

  /**
   * Creates or replaces a workspace config, in memory and in its file.
   *
   * @param config - The config; its `slug` is the key and the file name.
   * @returns The config as validated. Throws when it fails validation.
   */
  async saveWorkspace(config: WorkspaceConfig): Promise<WorkspaceConfig> {
    return this.workspaces.save(config);
  }

  /**
   * Removes a workspace config, from memory and from disk.
   *
   * @param slug - The workspace's slug; an unknown one is not an error.
   */
  async deleteWorkspace(slug: string): Promise<void> {
    await this.workspaces.delete(slug);
  }

  /** Replaces everything in memory with what the files hold, seeding settings.json when absent. */
  private async loadAll(): Promise<void> {
    this.settings = await this.loadSettings();
    await this.providers.load();
    await this.workspaces.load();
  }

  /**
   * Reads settings.json, writing it when it is absent or a bearer token had to be generated.
   *
   * @returns The settings. Throws when the file is not valid JSON or fails validation.
   *
   * @remarks
   * A token is generated, and printed that one time, when auth is on and neither the file nor `LLM_ROUTER_TOKEN`
   * holds one.
   */
  private async loadSettings(): Promise<SettingsFile> {
    const file = path.join(this.configDir, 'settings.json');
    const isStored = existsSync(file);
    const stored = isStored
      ? parseConfigFile(file, await readFile(file, 'utf8'), settingsFileSchema.parse.bind(settingsFileSchema))
      : settingsFileSchema.parse({});
    const auth = effectiveAuth(stored);
    // Auth is on and neither settings.json nor LLM_ROUTER_TOKEN holds a token.
    const needsToken = auth.enabled && (auth.token ?? '') === '';
    if (needsToken === false) {
      if (isStored === false) {
        await writeJsonAtomic(file, stored);
      }
      return stored;
    }
    const settings = { ...stored, authToken: randomBytes(CONFIG_DEFAULTS.authTokenBytes).toString('hex') };
    // The one time the token is printed: first run, when nobody has seen it yet.
    console.log(`[auth] generated a bearer token and saved it to ${file}:\n  ${settings.authToken}`);
    await writeJsonAtomic(file, settings);
    return settings;
  }
}
