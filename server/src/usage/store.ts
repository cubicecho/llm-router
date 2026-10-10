import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { type ProviderUsage, type TokenUsage, tokenUsageSchema } from '@llm-router/shared';
import { z } from 'zod';
import { USAGE_DEFAULTS, type UsageSettings } from '../core/defaults.ts';
import { errorMessage } from '../core/errors.ts';
import { writeJsonAtomic } from '../core/write-json-atomic.ts';
import type { ReportedUsage } from './reader.ts';

/** The usage file's name, directly under the data directory. */
const USAGE_FILE_NAME = 'usage.json';

/** What usage.json holds: counts by provider name, then by the model's id at the provider. */
const usageFileSchema = z.object({
  providers: z.record(z.string(), z.record(z.string(), tokenUsageSchema)),
});

/** One provider's counts, by the model's id at the provider. */
type ModelCounts = Map<string, TokenUsage>;

/**
 * Adds up counts.
 *
 * @param counts - The counts to add.
 * @returns Their sum; all zeros for none.
 */
function sumUsage(counts: Iterable<TokenUsage>): TokenUsage {
  const total: TokenUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };
  for (const count of counts) {
    total.requests += count.requests;
    total.inputTokens += count.inputTokens;
    total.outputTokens += count.outputTokens;
  }
  return total;
}

/**
 * Counts the requests each provider's models answered and the tokens they reported, and keeps the counts in
 * `<dataDir>/usage.json`.
 *
 * @remarks
 * Counts live in memory and are written a moment after they change, so a burst of requests is one write. The file is
 * outside `config/`, so the config watcher does not reload on it.
 */
export class UsageStore {
  private readonly file: string;
  private readonly settings: UsageSettings;
  private readonly providers = new Map<string, ModelCounts>();
  private flushTimer: NodeJS.Timeout | undefined;
  /** The write in progress, so two never overlap. */
  private writing: Promise<void> = Promise.resolve();

  /**
   * Builds an empty store; nothing is read until `init`.
   *
   * @param dataDir - The data directory; the file is `usage.json` in it.
   * @param [overrides] - Settings that differ from `USAGE_DEFAULTS`.
   */
  constructor(dataDir: string, overrides: Partial<UsageSettings> = {}) {
    this.file = path.join(dataDir, USAGE_FILE_NAME);
    this.settings = { ...USAGE_DEFAULTS, ...overrides };
  }

  /** Loads the counts from disk. A missing file means none yet; an unreadable one is logged and counting starts over. */
  async init(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    if (existsSync(this.file) === false) {
      return;
    }
    try {
      const stored = usageFileSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
      for (const [provider, models] of Object.entries(stored.providers)) {
        this.providers.set(provider, new Map(Object.entries(models)));
      }
    } catch (error) {
      console.warn(`[usage] ${this.file} could not be read, counting starts over: ${errorMessage(error)}`);
    }
  }

  /**
   * Counts one answered request.
   *
   * @param provider - The provider's name.
   * @param upstreamId - The model's id at the provider.
   * @param [reported] - The token counts the response carried. Left out, only the request is counted.
   */
  record(provider: string, upstreamId: string, reported?: ReportedUsage): void {
    const models = this.providers.get(provider) ?? new Map<string, TokenUsage>();
    const before = models.get(upstreamId) ?? sumUsage([]);
    models.set(upstreamId, {
      requests: before.requests + 1,
      inputTokens: before.inputTokens + (reported?.inputTokens ?? 0),
      outputTokens: before.outputTokens + (reported?.outputTokens ?? 0),
    });
    this.providers.set(provider, models);
    this.scheduleFlush();
  }

  /**
   * Drops a provider's counts, so one made later under its name starts from zero.
   *
   * @param provider - The provider's name.
   */
  forget(provider: string): void {
    if (this.providers.delete(provider)) {
      this.scheduleFlush();
    }
  }

  /**
   * Reads the counts.
   *
   * @returns Every provider that has been called, with its totals and its models, each sorted by name.
   */
  snapshot(): ProviderUsage[] {
    return [...this.providers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([provider, models]) => ({
        provider,
        ...sumUsage(models.values()),
        models: [...models.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([upstreamId, count]) => ({ upstreamId, ...count })),
      }));
  }

  /** Writes what is waiting, now. Called on shutdown, so the last requests are not lost. */
  async close(): Promise<void> {
    if (this.flushTimer === undefined) {
      await this.writing;
      return;
    }
    clearTimeout(this.flushTimer);
    await this.flush();
  }

  /** Arranges one write a moment from now, unless one is already arranged. */
  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) {
      return;
    }
    this.flushTimer = setTimeout(() => void this.flush(), this.settings.flushDelayMs);
    // A pending write does not hold the process open; `close` writes it on the way out.
    this.flushTimer.unref();
  }

  /** Writes the counts to disk after any write already in progress. A failure is logged, and the next change retries. */
  private async flush(): Promise<void> {
    this.flushTimer = undefined;
    const providers = Object.fromEntries(
      [...this.providers.entries()].map(([provider, models]) => [provider, Object.fromEntries(models)]),
    );
    this.writing = this.writing
      .then(() => writeJsonAtomic(this.file, { providers }))
      .catch((error: unknown) => {
        console.warn(`[usage] could not write ${this.file}: ${errorMessage(error)}`);
      });
    await this.writing;
  }
}
