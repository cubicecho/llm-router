import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { errorMessage } from '../core/errors.ts';
import { writeJsonAtomic } from '../core/write-json-atomic.ts';
import { parseConfigFile } from './parse-file.ts';

/** The extension of every config file. */
const CONFIG_FILE_EXTENSION = '.json';

/** What tells one kind of config (providers, workspaces) from another. */
export interface ConfigCollectionOptions<T> {
  /** The folder holding one file per config. */
  dir: string;
  /** What a config is called in the logs: `provider`, `workspace`. */
  kind: string;
  /** The field holding a config's key, as named in the logs: `name`, `slug`. */
  keyField: string;
  /** Validates a parsed file or a config about to be saved; throws to reject it. */
  parse: (value: unknown) => T;
  /** Reads a config's key, which is also its file name. */
  keyOf: (config: T) => string;
}

/**
 * One folder of config files, `<dir>/<key>.json`, and what they hold in memory.
 *
 * @typeParam T - The validated shape of one config.
 *
 * @remarks
 * The key inside a file wins over a file name that disagrees. Such a file is remembered as a stray and removed
 * once the config is saved or deleted; without that a hand-named file would come back on the next load, undoing a
 * delete or shadowing a save.
 */
export class ConfigCollection<T> {
  private readonly options: ConfigCollectionOptions<T>;
  private configs = new Map<string, T>();
  /** The file each config was read from, by key, when that is not `<dir>/<key>.json`. */
  private strayFiles = new Map<string, string>();

  /**
   * Remembers the folder; nothing is read or created until `init` or `load`.
   *
   * @param options - The folder, the validation and the key of this kind of config.
   */
  constructor(options: ConfigCollectionOptions<T>) {
    this.options = options;
  }

  /** Creates the folder when it is absent. */
  async init(): Promise<void> {
    await mkdir(this.options.dir, { recursive: true });
  }

  /** Replaces what is in memory with what the files hold, logging and skipping a file that is invalid. */
  async load(): Promise<void> {
    const { dir, kind, keyField, parse, keyOf } = this.options;
    const configs = new Map<string, T>();
    const strayFiles = new Map<string, string>();
    const files = (await readdir(dir)).filter(isConfigFile);
    for (const file of files.sort()) {
      const fullPath = path.join(dir, file);
      try {
        const config = parseConfigFile(fullPath, await readFile(fullPath, 'utf8'), parse);
        const key = keyOf(config);
        const isMisnamed = fileNameOf(key) !== file;
        if (isMisnamed) {
          console.warn(`[config] ${kind} config ${fullPath} has ${keyField} "${key}" that does not match its filename`);
          strayFiles.set(key, fullPath);
        }
        configs.set(key, config);
      } catch (err) {
        // A single broken (hand-edited) file must not take the router down; report and skip it.
        console.error(`[config] ignoring invalid ${kind} config ${fullPath}: ${errorMessage(err)}`);
      }
    }
    this.configs = configs;
    this.strayFiles = strayFiles;
  }

  /**
   * Lists the configs.
   *
   * @returns A new array, in no promised order.
   */
  values(): T[] {
    return [...this.configs.values()];
  }

  /**
   * Finds a config.
   *
   * @param key - The config's key.
   * @returns The config, or undefined when there is none by that key.
   */
  get(key: string): T | undefined {
    return this.configs.get(key);
  }

  /**
   * Creates or replaces a config, in memory and in its file.
   *
   * @param config - The config; its key is the file name.
   * @returns The config as validated. Throws when it fails validation.
   */
  async save(config: T): Promise<T> {
    const parsed = this.options.parse(config);
    const key = this.options.keyOf(parsed);
    await writeJsonAtomic(this.fileOf(key), parsed);
    await this.removeStrayFile(key);
    this.configs.set(key, parsed);
    return parsed;
  }

  /**
   * Removes a config, from memory and from disk.
   *
   * @param key - The config's key; an unknown one is not an error.
   */
  async delete(key: string): Promise<void> {
    await rm(this.fileOf(key), { force: true });
    await this.removeStrayFile(key);
    this.configs.delete(key);
  }

  /**
   * Removes the misnamed file a config was read from, once its own file has been written or removed.
   *
   * @param key - The config's key; its stray entry is dropped.
   */
  private async removeStrayFile(key: string): Promise<void> {
    const stray = this.strayFiles.get(key);
    if (stray === undefined) {
      return;
    }
    await rm(stray, { force: true });
    this.strayFiles.delete(key);
  }

  /**
   * Names the file a config is kept in.
   *
   * @param key - The config's key.
   * @returns The path of `<dir>/<key>.json`.
   */
  private fileOf(key: string): string {
    return path.join(this.options.dir, fileNameOf(key));
  }
}

/**
 * Names the file a config with this key belongs in.
 *
 * @param key - The config's key.
 * @returns `<key>.json`.
 */
function fileNameOf(key: string): string {
  return `${key}${CONFIG_FILE_EXTENSION}`;
}

/**
 * Tells a config file from anything else left in the folder.
 *
 * @param fileName - A name read from the folder.
 * @returns True when the name ends in `.json`.
 */
function isConfigFile(fileName: string): boolean {
  return fileName.endsWith(CONFIG_FILE_EXTENSION);
}
