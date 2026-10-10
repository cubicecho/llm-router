import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type DayUsage,
  type TokenUsage,
  tokenUsageSchema,
  type UsageResponse,
  type WorkspaceModelUsage,
} from '@llm-router/shared';
import { z } from 'zod';
import { USAGE_DEFAULTS, type UsageSettings } from '../core/defaults.ts';
import { errorMessage } from '../core/errors.ts';
import { writeJsonAtomic } from '../core/write-json-atomic.ts';
import { localDay, oldestDetailDay } from './day.ts';
import type { ReportedUsage } from './reader.ts';

/** The usage file's name, directly under the data directory. */
const USAGE_FILE_NAME = 'usage.json';

/** One line of the count: what one model answered through one endpoint on one day. */
const usageEntrySchema = tokenUsageSchema.extend({
  /** The day as `YYYY-MM-DD`. Left out once the day is too old to keep its own counts. */
  day: z.string().optional(),
  /** The slug of the workspace the requests came through. Left out for the global endpoint and for a deleted workspace. */
  workspace: z.string().optional(),
  provider: z.string(),
  /** The model's id at the provider. */
  upstreamId: z.string(),
});
type UsageEntry = z.infer<typeof usageEntrySchema>;

/** What usage.json holds. */
const usageFileSchema = z.object({ entries: z.array(usageEntrySchema) });

/** What usage.json held before counts had a day and a workspace: totals by provider, then by model. */
const legacyUsageFileSchema = z.object({
  providers: z.record(z.string(), z.record(z.string(), tokenUsageSchema)),
});

/** What a request was served by. */
export interface ServedBy {
  /** The slug of the workspace whose endpoint was called; left out for the global endpoint. */
  workspace?: string | undefined;
  provider: string;
  /** The model's id at the provider. */
  upstreamId: string;
}

/**
 * Builds the key two entries share when they count the same thing.
 *
 * @param entry - The entry, or what it is about.
 * @returns A string unique to its day, workspace, provider and model.
 */
function entryKey(entry: Pick<UsageEntry, 'day' | 'workspace' | 'provider' | 'upstreamId'>): string {
  return JSON.stringify([entry.day ?? null, entry.workspace ?? null, entry.provider, entry.upstreamId]);
}

/**
 * Adds counts to the ones kept under a key.
 *
 * @param totals - The running totals; changed in place.
 * @param key - What the counts belong to.
 * @param counts - The counts to add.
 */
function addTo(totals: Map<string, TokenUsage>, key: string, counts: TokenUsage): void {
  const before = totals.get(key);
  totals.set(key, {
    requests: (before?.requests ?? 0) + counts.requests,
    inputTokens: (before?.inputTokens ?? 0) + counts.inputTokens,
    outputTokens: (before?.outputTokens ?? 0) + counts.outputTokens,
  });
}

/**
 * Adds up counts.
 *
 * @param counts - The counts to add.
 * @returns Their sum; all zeros for none.
 */
function sumUsage(counts: Iterable<TokenUsage>): TokenUsage {
  const totals = new Map<string, TokenUsage>([['', { requests: 0, inputTokens: 0, outputTokens: 0 }]]);
  for (const count of counts) {
    addTo(totals, '', count);
  }
  return totals.get('') as TokenUsage;
}

/**
 * Sorts entries into groups.
 *
 * @param entries - The entries.
 * @param groupOf - Names an entry's group; undefined leaves the entry out.
 * @returns The groups, by name, in name order.
 */
function groupBy(entries: UsageEntry[], groupOf: (entry: UsageEntry) => string | undefined): [string, UsageEntry[]][] {
  const groups = new Map<string, UsageEntry[]>();
  for (const entry of entries) {
    const group = groupOf(entry);
    if (group !== undefined) {
      groups.set(group, [...(groups.get(group) ?? []), entry]);
    }
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

/**
 * Adds entries up by day.
 *
 * @param entries - The entries of one provider or workspace.
 * @returns One line per day that still keeps its own counts, newest first.
 */
function daysOf(entries: UsageEntry[]): DayUsage[] {
  return groupBy(entries, (entry) => entry.day)
    .map(([day, ofDay]) => ({ day, ...sumUsage(ofDay) }))
    .reverse();
}

/**
 * Adds entries up by model.
 *
 * @param entries - The entries of one provider or workspace.
 * @returns One line per provider and model, in that order.
 */
function modelsOf(entries: UsageEntry[]): WorkspaceModelUsage[] {
  return groupBy(entries, (entry) => JSON.stringify([entry.provider, entry.upstreamId])).map(([, ofModel]) => {
    const [{ provider, upstreamId }] = ofModel as [UsageEntry, ...UsageEntry[]];
    return { provider, upstreamId, ...sumUsage(ofModel) };
  });
}

/**
 * Counts the requests each provider's models answered and the tokens they reported, by day and by the workspace they
 * came through, and keeps the counts in `<dataDir>/usage.json`.
 *
 * @remarks
 * Counts live in memory and are written a moment after they change, so a burst of requests is one write. The file is
 * outside `config/`, so the config watcher does not reload on it. A day older than `detailDays` loses its own line
 * and stays in the totals, so the file does not grow without end.
 */
export class UsageStore {
  private readonly file: string;
  private readonly settings: UsageSettings;
  private readonly now: () => Date;
  private entries = new Map<string, UsageEntry>();
  /** The day of the last request counted, so old days are folded once a day and not on every request. */
  private lastDay = '';
  private flushTimer: NodeJS.Timeout | undefined;
  /** The write in progress, so two never overlap. */
  private writing: Promise<void> = Promise.resolve();

  /**
   * Builds an empty store; nothing is read until `init`.
   *
   * @param dataDir - The data directory; the file is `usage.json` in it.
   * @param [overrides] - Settings that differ from `USAGE_DEFAULTS`.
   * @param [now] - Tells the time; a test passes its own clock.
   */
  constructor(dataDir: string, overrides: Partial<UsageSettings> = {}, now: () => Date = () => new Date()) {
    this.file = path.join(dataDir, USAGE_FILE_NAME);
    this.settings = { ...USAGE_DEFAULTS, ...overrides };
    this.now = now;
  }

  /** Loads the counts from disk. A missing file means none yet; an unreadable one is logged and counting starts over. */
  async init(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    if (existsSync(this.file) === false) {
      return;
    }
    try {
      const stored: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      this.replaceEntries(this.readStored(stored));
      this.foldOldDays();
    } catch (error) {
      console.warn(`[usage] ${this.file} could not be read, counting starts over: ${errorMessage(error)}`);
    }
  }

  /**
   * Counts one answered request, on today's line.
   *
   * @param served - The workspace it came through, and the provider and model that answered.
   * @param [reported] - The token counts the response carried. Left out, only the request is counted.
   */
  record(served: ServedBy, reported?: ReportedUsage): void {
    const day = localDay(this.now());
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.foldOldDays();
    }
    const about = { day, workspace: served.workspace, provider: served.provider, upstreamId: served.upstreamId };
    const key = entryKey(about);
    const before = this.entries.get(key);
    this.entries.set(key, {
      ...about,
      requests: (before?.requests ?? 0) + 1,
      inputTokens: (before?.inputTokens ?? 0) + (reported?.inputTokens ?? 0),
      outputTokens: (before?.outputTokens ?? 0) + (reported?.outputTokens ?? 0),
    });
    this.scheduleFlush();
  }

  /**
   * Drops a provider's counts, so one made later under its name starts from zero.
   *
   * @param provider - The provider's name.
   */
  forgetProvider(provider: string): void {
    this.rewrite((entry) => (entry.provider === provider ? undefined : entry));
  }

  /**
   * Moves a workspace's counts to its new slug.
   *
   * @param from - The slug the workspace had.
   * @param to - The slug it has now.
   */
  renameWorkspace(from: string, to: string): void {
    this.rewrite((entry) => (entry.workspace === from ? { ...entry, workspace: to } : entry));
  }

  /**
   * Takes a deleted workspace's name off its counts. Its providers keep them, and a workspace made later under the
   * same slug starts from zero.
   *
   * @param slug - The workspace's slug.
   */
  releaseWorkspace(slug: string): void {
    this.rewrite((entry) => (entry.workspace === slug ? { ...entry, workspace: undefined } : entry));
  }

  /** Drops every count. */
  reset(): void {
    this.entries = new Map();
    this.scheduleFlush();
  }

  /**
   * Reads the counts.
   *
   * @returns Every provider that has been called and every workspace that has been called through, each in name
   * order with its totals, its models and its recent days.
   */
  snapshot(): UsageResponse {
    const entries = [...this.entries.values()];
    return {
      providers: groupBy(entries, (entry) => entry.provider).map(([provider, ofProvider]) => ({
        provider,
        ...sumUsage(ofProvider),
        models: modelsOf(ofProvider).map(({ provider: _provider, ...model }) => model),
        days: daysOf(ofProvider),
      })),
      workspaces: groupBy(entries, (entry) => entry.workspace).map(([workspace, ofWorkspace]) => ({
        workspace,
        ...sumUsage(ofWorkspace),
        models: modelsOf(ofWorkspace),
        days: daysOf(ofWorkspace),
      })),
    };
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

  /**
   * Reads the entries out of a parsed usage file, in this version's shape or the one before it.
   *
   * @param stored - The parsed file.
   * @returns Its entries. The older shape had no day or workspace, so its counts come back with neither.
   * @throws A ZodError when the file is in neither shape.
   */
  private readStored(stored: unknown): UsageEntry[] {
    const legacy = legacyUsageFileSchema.safeParse(stored);
    if (legacy.success) {
      return Object.entries(legacy.data.providers).flatMap(([provider, models]) =>
        Object.entries(models).map(([upstreamId, counts]) => ({ provider, upstreamId, ...counts })),
      );
    }
    return usageFileSchema.parse(stored).entries;
  }

  /**
   * Replaces the entries, adding together any that count the same thing.
   *
   * @param entries - The entries to hold from now on.
   */
  private replaceEntries(entries: Iterable<UsageEntry>): void {
    const merged = new Map<string, UsageEntry>();
    for (const entry of entries) {
      const key = entryKey(entry);
      const before = merged.get(key);
      merged.set(key, before === undefined ? entry : { ...entry, ...sumUsage([before, entry]) });
    }
    this.entries = merged;
  }

  /**
   * Changes or drops entries, and writes the result when anything changed.
   *
   * @param change - Returns the entry to keep in an entry's place, the entry itself to leave it, or undefined to drop it.
   */
  private rewrite(change: (entry: UsageEntry) => UsageEntry | undefined): void {
    const before = [...this.entries.values()];
    const after = before.map(change);
    if (after.every((entry, index) => entry === before[index])) {
      return;
    }
    this.replaceEntries(after.filter((entry) => entry !== undefined));
    this.scheduleFlush();
  }

  /** Takes the day off every entry older than `detailDays`, which folds it into the entry that has none. */
  private foldOldDays(): void {
    const oldest = oldestDetailDay(this.now(), this.settings.detailDays);
    this.rewrite((entry) => (entry.day !== undefined && entry.day < oldest ? { ...entry, day: undefined } : entry));
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
    const entries = [...this.entries.values()];
    this.writing = this.writing
      .then(() => writeJsonAtomic(this.file, { entries }))
      .catch((error: unknown) => {
        console.warn(`[usage] could not write ${this.file}: ${errorMessage(error)}`);
      });
    await this.writing;
  }
}
