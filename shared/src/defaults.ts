// The values the config contract falls back to or is bounded by, as plain data.
// Nothing here computes, reads the environment or imports.

/** What settings.json means when a key is absent. */
export interface RouterSettings {
  /** The port to listen on. `PORT` overrides it. */
  port: number;
  /** How long a provider may take to start answering a proxied request, in ms. Long, because a non-streamed completion answers only once it is whole. */
  responseTimeoutMs: number;
}

/** The values `settings.json` falls back to, frozen. */
export const SETTINGS_DEFAULTS: Readonly<RouterSettings> = Object.freeze({
  port: 3000,
  responseTimeoutMs: 600_000,
});

/** What a new pool starts with where its form offers a value. */
export interface PoolSettings {
  /** The bounded-load factor offered when it is switched on. 1.25 lets a target run a quarter over the average. */
  suggestedLoadFactor: number;
}

/** The values a new pool is offered, frozen. */
export const POOL_DEFAULTS: Readonly<PoolSettings> = Object.freeze({
  suggestedLoadFactor: 1.25,
});

/** How long the names in config files may be. */
export interface NameSettings {
  /** Longest provider name, pool name or workspace slug, in characters. Each is a route segment and a file name. */
  providerNameMaxLength: number;
  /** Longest workspace display name, in characters. */
  workspaceNameMaxLength: number;
}

/** The length limits on names in config files, frozen. */
export const NAME_DEFAULTS: Readonly<NameSettings> = Object.freeze({
  providerNameMaxLength: 64,
  workspaceNameMaxLength: 100,
});
