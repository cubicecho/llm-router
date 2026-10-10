import { isRecord } from '../core/is-record.ts';

/** The token counts one response reported. */
export interface ReportedUsage {
  inputTokens: number;
  outputTokens: number;
}

/** The prefix of a server-sent event's data line. */
const SSE_DATA_PREFIX = 'data:';
/** What a data line holds when it carries token counts; lines without it are not parsed. */
const USAGE_KEY = '"usage"';

/**
 * Reads a count out of a usage object, under whichever of two names it has.
 *
 * @param usage - The provider's usage object.
 * @param names - The field's name in chat completions, then in the responses API.
 * @returns The count, or undefined when neither field is a whole number that is not negative.
 */
function tokenCount(usage: Record<string, unknown>, names: readonly [string, string]): number | undefined {
  const value = names.map((name) => usage[name]).find((candidate) => typeof candidate === 'number');
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Finds the token counts in a provider's JSON: a response body, or one event of a stream.
 *
 * @param json - The parsed JSON.
 * @returns The counts, or undefined when it reports none.
 *
 * @remarks
 * Chat completions, completions and embeddings carry `usage.prompt_tokens` and `usage.completion_tokens`. The
 * responses API carries `usage.input_tokens` and `usage.output_tokens`, and nests the whole response under
 * `response` in its stream events. An embedding has no output, so a missing side counts as zero.
 */
export function readUsage(json: unknown): ReportedUsage | undefined {
  if (isRecord(json) === false) {
    return undefined;
  }
  const holder = isRecord(json.response) ? json.response : json;
  const { usage } = holder;
  if (isRecord(usage) === false) {
    return undefined;
  }
  const inputTokens = tokenCount(usage, ['prompt_tokens', 'input_tokens']);
  const outputTokens = tokenCount(usage, ['completion_tokens', 'output_tokens']);
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }
  return { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 };
}

/**
 * Parses text as JSON and finds the token counts in it.
 *
 * @param text - A response body, or the payload of one stream event.
 * @returns The counts, or undefined when the text is not JSON or reports none.
 */
function readUsageText(text: string): ReportedUsage | undefined {
  try {
    return readUsage(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** Watches a response body go by, chunk by chunk, and finds the token counts in it. */
export class UsageReader {
  private readonly isEventStream: boolean;
  private readonly maxResponseBytes: number;
  private readonly decoder = new TextDecoder();
  /** A stream's unfinished last line, or a JSON body so far. */
  private pending = '';
  private byteCount = 0;
  private found: ReportedUsage | undefined;

  /**
   * Builds a reader for one response.
   *
   * @param isEventStream - True for a server-sent event stream, false for one JSON document.
   * @param maxResponseBytes - A JSON document larger than this is not kept or read.
   */
  constructor(isEventStream: boolean, maxResponseBytes: number) {
    this.isEventStream = isEventStream;
    this.maxResponseBytes = maxResponseBytes;
  }

  /**
   * Takes the next chunk of the body.
   *
   * @param chunk - The bytes, as they were received.
   */
  push(chunk: Uint8Array): void {
    this.byteCount += chunk.byteLength;
    const isTooLarge = this.isEventStream === false && this.byteCount > this.maxResponseBytes;
    if (isTooLarge) {
      this.pending = '';
      return;
    }
    this.pending += this.decoder.decode(chunk, { stream: true });
    if (this.isEventStream) {
      this.readCompleteLines();
    }
  }

  /**
   * Says what the body reported, once it has all gone by.
   *
   * @returns The counts, or undefined when the body reported none. A stream's last report wins.
   */
  result(): ReportedUsage | undefined {
    if (this.isEventStream) {
      this.readLine(this.pending);
      this.pending = '';
      return this.found;
    }
    return readUsageText(this.pending);
  }

  /** Reads every finished line held so far, and keeps the unfinished one for the next chunk. */
  private readCompleteLines(): void {
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';
    for (const line of lines) {
      this.readLine(line);
    }
  }

  /**
   * Reads one line of a stream, keeping its token counts when it has them.
   *
   * @param line - The line, without its newline.
   */
  private readLine(line: string): void {
    const isUsageEvent = line.startsWith(SSE_DATA_PREFIX) && line.includes(USAGE_KEY);
    if (isUsageEvent) {
      this.found = readUsageText(line.slice(SSE_DATA_PREFIX.length)) ?? this.found;
    }
  }
}
