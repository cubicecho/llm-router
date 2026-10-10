// Every fixed value someone might tune, as plain data. Nothing here computes, reads the environment or imports.
// What an operator can change at run time lives in settings.json (`SETTINGS_DEFAULTS` in the shared package).

/** Settings for the HTTP doors. */
export interface HttpSettings {
  /**
   * Idle time before an inbound keep-alive connection is closed, in ms. Above the 60 s nginx and ALB hold theirs.
   * `HTTP_KEEP_ALIVE_TIMEOUT_MS` overrides it.
   */
  keepAliveTimeoutMs: number;
  /**
   * Idle time before an outbound connection is closed when the remote names none, in ms. Below the 60 s most servers
   * allow. `HTTP_OUTBOUND_KEEP_ALIVE_TIMEOUT_MS` overrides it.
   */
  outboundKeepAliveTimeoutMs: number;
  /** Largest JSON body /api and /v1 accept, as `express.json` reads it. Roomy, because a chat request may carry images. */
  bodyLimit: string;
  /** How long in-flight requests get to finish after a stop signal, in seconds. Open streams are cut after it. */
  drainSeconds: number;
  /**
   * How long the whole shutdown may take before the process exits anyway, in seconds. Under the 10 s Docker waits
   * before SIGKILL.
   */
  shutdownDeadlineSeconds: number;
}

/** The fixed HTTP settings this build ships with. */
export const HTTP_DEFAULTS: Readonly<HttpSettings> = Object.freeze({
  keepAliveTimeoutMs: 75_000,
  outboundKeepAliveTimeoutMs: 30_000,
  bodyLimit: '32mb',
  drainSeconds: 5,
  shutdownDeadlineSeconds: 8,
});

/** Settings for the config files under DATA_DIR/config. */
export interface ConfigSettings {
  /** How long config-file changes are gathered before one reload, in ms. */
  watchDebounceMs: number;
  /** Random bytes in a generated auth token. It is stored as twice as many hex characters. */
  authTokenBytes: number;
}

/** The fixed config-file settings this build ships with. */
export const CONFIG_DEFAULTS: Readonly<ConfigSettings> = Object.freeze({
  watchDebounceMs: 300,
  authTokenBytes: 32,
});

/** Settings for the calls to providers. */
export interface GatewaySettings {
  /** How long a provider's model listing is reused before it is fetched again, in seconds. */
  modelListCacheSeconds: number;
  /** How long a provider may take to answer a model listing, in ms. Short, so one dead provider does not hold up the merged list. */
  modelListTimeoutMs: number;
  /** How much of a provider's error body is passed on as detail, in characters. */
  errorBodyMaxChars: number;
}

/** The fixed gateway settings this build ships with. */
export const GATEWAY_DEFAULTS: Readonly<GatewaySettings> = Object.freeze({
  modelListCacheSeconds: 60,
  modelListTimeoutMs: 10_000,
  errorBodyMaxChars: 500,
});

/** Settings for counting the tokens providers report. */
export interface UsageSettings {
  /** How long new counts wait in memory before usage.json is rewritten, in ms. One write then covers a burst of requests. */
  flushDelayMs: number;
  /** Largest non-streamed response body read for its token counts, in bytes. A larger one is forwarded and counted as a request only. */
  maxResponseBytes: number;
  /** How many days keep their own counts, today included. Older days are folded into the all-time totals. */
  detailDays: number;
}

/** The fixed usage settings this build ships with. */
export const USAGE_DEFAULTS: Readonly<UsageSettings> = Object.freeze({
  flushDelayMs: 2000,
  maxResponseBytes: 8_388_608,
  detailDays: 90,
});
