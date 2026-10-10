import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
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
import { effectiveAuth } from '../auth/middleware.ts';
import { CONFIG_DEFAULTS } from '../core/defaults.ts';
import { errorMessage } from '../core/errors.ts';
import { writeJsonAtomic } from '../core/write-json-atomic.ts';

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
  private providers = new Map<string, ProviderConfig>();
  private workspaces = new Map<string, WorkspaceConfig>();
  /** The file each provider was read from, by name, when that is not `providers/<name>.json`. */
  private strayProviderFiles = new Map<string, string>();
  /** The file each workspace was read from, by slug, when that is not `workspaces/<slug>.json`. */
  private strayWorkspaceFiles = new Map<string, string>();
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
  }

  /** Create directories, seed defaults on first run and load everything. */
  async init(): Promise<void> {
    await mkdir(this.providersDir, { recursive: true });
    await mkdir(this.workspacesDir, { recursive: true });
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
    return [...this.providers.values()].sort((a, b) => a.name.localeCompare(b.name));
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
    const parsed = providerConfigSchema.parse(config);
    await writeJsonAtomic(this.providerFile(parsed.name), parsed);
    await this.removeStrayFile(this.strayProviderFiles, parsed.name);
    this.providers.set(parsed.name, parsed);
    return parsed;
  }

  /**
   * Removes a provider config, from memory and from disk.
   *
   * @param name - The provider's name; an unknown one is not an error.
   */
  async deleteProvider(name: string): Promise<void> {
    await rm(this.providerFile(name), { force: true });
    await this.removeStrayFile(this.strayProviderFiles, name);
    this.providers.delete(name);
  }

  /**
   * Lists the workspace configs.
   *
   * @returns A new array, sorted by name.
   */
  getWorkspaces(): WorkspaceConfig[] {
    return [...this.workspaces.values()].sort((a, b) => a.name.localeCompare(b.name));
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
    const parsed = workspaceConfigSchema.parse(config);
    await writeJsonAtomic(this.workspaceFile(parsed.slug), parsed);
    await this.removeStrayFile(this.strayWorkspaceFiles, parsed.slug);
    this.workspaces.set(parsed.slug, parsed);
    return parsed;
  }

  /**
   * Removes a workspace config, from memory and from disk.
   *
   * @param slug - The workspace's slug; an unknown one is not an error.
   */
  async deleteWorkspace(slug: string): Promise<void> {
    await rm(this.workspaceFile(slug), { force: true });
    await this.removeStrayFile(this.strayWorkspaceFiles, slug);
    this.workspaces.delete(slug);
  }

  /**
   * Removes the misnamed file an entry was read from, once its own file has been written or removed.
   *
   * @param strayFiles - The misnamed files by key; the key's entry is dropped.
   * @param key - The provider name or workspace slug.
   *
   * @remarks
   * Without this a hand-named file would come back on the next reload, undoing a delete or shadowing a save.
   */
  private async removeStrayFile(strayFiles: Map<string, string>, key: string): Promise<void> {
    const stray = strayFiles.get(key);
    if (stray === undefined) {
      return;
    }
    await rm(stray, { force: true });
    strayFiles.delete(key);
  }

  /**
   * Names the file a provider's config is kept in.
   *
   * @param name - The provider's name.
   * @returns The path of `providers/<name>.json`.
   */
  private providerFile(name: string): string {
    return path.join(this.providersDir, `${name}.json`);
  }

  /**
   * Names the file a workspace's config is kept in.
   *
   * @param slug - The workspace's slug.
   * @returns The path of `workspaces/<slug>.json`.
   */
  private workspaceFile(slug: string): string {
    return path.join(this.workspacesDir, `${slug}.json`);
  }

  /** Replaces everything in memory with what the files hold, seeding settings.json when absent. */
  private async loadAll(): Promise<void> {
    this.settings = await this.loadSettings();
    this.providers = await this.loadProviders();
    this.workspaces = await this.loadWorkspaces();
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
    let settings: SettingsFile;
    let dirty = false;
    if (existsSync(file)) {
      settings = this.parseFile(file, await readFile(file, 'utf8'), settingsFileSchema.parse.bind(settingsFileSchema));
    } else {
      settings = settingsFileSchema.parse({});
      dirty = true;
    }
    const auth = effectiveAuth(settings);
    // Auth is on and neither settings.json nor LLM_ROUTER_TOKEN holds a token.
    if (auth.enabled && !auth.token) {
      settings.authToken = randomBytes(CONFIG_DEFAULTS.authTokenBytes).toString('hex');
      dirty = true;
      // The one time the token is printed: first run, when nobody has seen it yet.
      console.log(`[auth] generated a bearer token and saved it to ${file}:\n  ${settings.authToken}`);
    }
    if (dirty) {
      await writeJsonAtomic(file, settings);
    }
    return settings;
  }

  /**
   * Reads every `providers/*.json`, logging and skipping a file that is invalid.
   *
   * @returns The configs by the `name` inside each file, which wins over a file name that disagrees.
   */
  private async loadProviders(): Promise<Map<string, ProviderConfig>> {
    const providers = new Map<string, ProviderConfig>();
    this.strayProviderFiles = new Map();
    const files = (await readdir(this.providersDir)).filter((f) => f.endsWith('.json'));
    for (const file of files.sort()) {
      const fullPath = path.join(this.providersDir, file);
      try {
        const config = this.parseFile(
          fullPath,
          await readFile(fullPath, 'utf8'),
          providerConfigSchema.parse.bind(providerConfigSchema),
        );
        if (`${config.name}.json` !== file) {
          console.warn(
            `[config] provider config ${fullPath} has name "${config.name}" that does not match its filename`,
          );
          this.strayProviderFiles.set(config.name, fullPath);
        }
        providers.set(config.name, config);
      } catch (err) {
        // A single broken (hand-edited) provider file must not take the router down; report and skip it.
        console.error(`[config] ignoring invalid provider config ${fullPath}: ${errorMessage(err)}`);
      }
    }
    return providers;
  }

  /**
   * Reads every `workspaces/*.json`, logging and skipping a file that is invalid.
   *
   * @returns The configs by the `slug` inside each file, which wins over a file name that disagrees.
   */
  private async loadWorkspaces(): Promise<Map<string, WorkspaceConfig>> {
    const workspaces = new Map<string, WorkspaceConfig>();
    this.strayWorkspaceFiles = new Map();
    const files = (await readdir(this.workspacesDir)).filter((f) => f.endsWith('.json'));
    for (const file of files.sort()) {
      const fullPath = path.join(this.workspacesDir, file);
      try {
        const config = this.parseFile(
          fullPath,
          await readFile(fullPath, 'utf8'),
          workspaceConfigSchema.parse.bind(workspaceConfigSchema),
        );
        if (`${config.slug}.json` !== file) {
          console.warn(
            `[config] workspace config ${fullPath} has slug "${config.slug}" that does not match its filename`,
          );
          this.strayWorkspaceFiles.set(config.slug, fullPath);
        }
        workspaces.set(config.slug, config);
      } catch (err) {
        // A single broken (hand-edited) workspace file must not take the router down; report and skip it.
        console.error(`[config] ignoring invalid workspace config ${fullPath}: ${errorMessage(err)}`);
      }
    }
    return workspaces;
  }

  /**
   * Parses and validates one config file's text.
   *
   * @typeParam T - The validated shape.
   * @param file - The file's path, named in the error.
   * @param raw - The file's text.
   * @param parse - Validates the parsed JSON; throws to reject it.
   * @returns The validated value. Throws an Error naming the file when the JSON or the validation fails.
   */
  private parseFile<T>(file: string, raw: string, parse: (value: unknown) => T): T {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (cause) {
      throw new Error(`${file} is not valid JSON: ${errorMessage(cause)}`, { cause });
    }
    try {
      return parse(json);
    } catch (cause) {
      throw new Error(`${file} failed validation: ${errorMessage(cause)}`, { cause });
    }
  }
}
