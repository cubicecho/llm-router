// Schemas for the flat config files stored under DATA_DIR/config. The files are hand-editable, so parsing is always
// lenient on unknown keys and what a user added survives a round trip.
import { z } from 'zod';
import { NAME_DEFAULTS, SETTINGS_DEFAULTS } from './defaults.ts';

/** Splits a routed model id into its provider and the provider's own id: `<provider>/<model>`. */
export const MODEL_SEPARATOR = '/';

/** A provider name is the prefix of its model ids and its file name, so it never holds a slash. */
export const providerNameSchema = z
  .string()
  .min(1)
  .max(NAME_DEFAULTS.providerNameMaxLength)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase alphanumerics, dots, dashes, underscores; must start alphanumeric');

/**
 * A workspace slug is its route segment at /w/<slug>/v1 and its file name.
 *
 * @remarks
 * It follows the same rule as a provider name, so `slugify` serves both.
 */
export const workspaceSlugSchema = providerNameSchema;

/** An http or https URL. */
export const httpUrlSchema = z.url({ protocol: /^https?$/ });

/** Shape of `settings.json`; every key has a fallback, so an empty object parses. */
export const settingsFileSchema = z
  .object({
    /** HTTP port. Env PORT wins over this. */
    port: z.number().int().positive().default(SETTINGS_DEFAULTS.port),
    /** Bearer token for the management API and every /v1 endpoint. Env LLM_ROUTER_TOKEN wins.
     *  Generated on first run when auth is enabled and no token exists. */
    authToken: z.string().nullable().default(null),
    /** Disable to allow unauthenticated access (trusted networks only). */
    authEnabled: z.boolean().default(true),
    /** Network interface to bind. Env HOST wins. Unset binds all interfaces (needed for Docker/LAN
     *  exposure); set to 127.0.0.1 to restrict to localhost. */
    host: z.string().optional(),
    /** Extra browser Origins allowed to reach /v1, for DNS-rebinding protection. Loopback origins
     *  are always allowed and native clients send no Origin; add browser-based clients here. */
    allowedOrigins: z.array(z.string()).default([]),
    /** How long a provider may take to send response headers for a proxied request. A stream that
     *  has started is never cut by it. */
    responseTimeoutMs: z.number().int().positive().default(SETTINGS_DEFAULTS.responseTimeoutMs),
  })
  .loose();

/** Parsed `settings.json`, fallbacks filled in. */
export type SettingsFile = z.infer<typeof settingsFileSchema>;

/** Shape of `providers/<name>.json`: one OpenAI-compatible model server. */
export const providerConfigSchema = z
  .object({
    name: providerNameSchema,
    displayName: z.string().optional(),
    description: z.string().optional(),
    /** Disable to drop the provider's models from every endpoint without deleting it. */
    enabled: z.boolean().default(true),
    /** The provider's OpenAI base URL, as an SDK's `base_url` takes it, e.g. https://api.openai.com/v1 */
    baseUrl: httpUrlSchema,
    /** Sent upstream as `Authorization: Bearer <apiKey>`. Plaintext; the API never returns it. */
    apiKey: z.string().min(1).optional(),
    /** Extra headers sent upstream on every request; one named like a default header replaces it. */
    headers: z.record(z.string(), z.string()).default({}),
  })
  .loose();

/** One provider's stored config. */
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/** A pool's name is the model id clients ask for and its file name; it never holds a slash, so it is never a provider's model id. */
export const poolNameSchema = providerNameSchema;

/** How a pool picks a target when no sticky key decides. */
export const PoolStrategy = {
  /** Each target in turn. */
  RoundRobin: 'round-robin',
  /** The target with the fewest requests in flight; ties go to the earliest listed. */
  LeastBusy: 'least-busy',
  /** Any target, at random. */
  Random: 'random',
} as const;
/** How a pool picks a target when no sticky key decides. */
export type PoolStrategy = (typeof PoolStrategy)[keyof typeof PoolStrategy];

/** Whether a pool keeps requests that share a key on the same target. */
export const PoolAffinity = {
  /** Every request is placed by the strategy. */
  None: 'none',
  /** Requests that share a key go to the same target, so its prompt cache is reused. */
  Sticky: 'sticky',
} as const;
/** Whether a pool keeps requests that share a key on the same target. */
export type PoolAffinity = (typeof PoolAffinity)[keyof typeof PoolAffinity];

/** The smallest bounded-load factor: below 1 no target could ever take a request. */
export const MIN_LOAD_FACTOR = 1;

/** One place a pool can send a request: a provider and the model's id at that provider. */
export const poolTargetSchema = z
  .object({
    provider: providerNameSchema,
    /** The model's id at the provider. */
    model: z.string().min(1),
  })
  .loose();

/** One place a pool can send a request. */
export type PoolTarget = z.infer<typeof poolTargetSchema>;

/** Shape of `pools/<name>.json`: one model id served by several targets. */
export const poolConfigSchema = z
  .object({
    name: poolNameSchema,
    displayName: z.string().optional(),
    description: z.string().optional(),
    /** Disable to drop the pool from every endpoint without deleting it. */
    enabled: z.boolean().default(true),
    strategy: z.enum(PoolStrategy).default(PoolStrategy.LeastBusy),
    affinity: z.enum(PoolAffinity).default(PoolAffinity.Sticky),
    /**
     * Bounded load: a sticky request skips a target running more than this times the pool's average in-flight load.
     * Left out, a sticky request always goes to its own target.
     */
    maxLoadFactor: z.number().min(MIN_LOAD_FACTOR).optional(),
    targets: z.array(poolTargetSchema).default([]),
  })
  .loose();

/** One pool's stored config. */
export type PoolConfig = z.infer<typeof poolConfigSchema>;

/** A provider's participation in a workspace. */
export const workspaceMemberSchema = z
  .object({
    /** Include this provider in the workspace. Absent members are not in the workspace. */
    enabled: z.boolean().default(true),
    /** The provider's own model ids this workspace exposes. Left out, it exposes every model the provider lists. */
    models: z.array(z.string().min(1)).optional(),
  })
  .loose();

/** A named aggregate exposing a chosen subset of providers at /w/<slug>/v1. */
export const workspaceConfigSchema = z
  .object({
    /** Human-facing display name. */
    name: z.string().min(1).max(NAME_DEFAULTS.workspaceNameMaxLength),
    /** URL slug — the route segment at /w/<slug>/v1, also the config filename. */
    slug: workspaceSlugSchema,
    /** Disable to 404 the workspace's endpoint without deleting it. */
    enabled: z.boolean().default(true),
    description: z.string().optional(),
    /** Members keyed by provider name. Only listed providers are in the workspace. */
    members: z.record(z.string(), workspaceMemberSchema).default({}),
    /** The names of the pools the workspace serves, whatever its members. */
    pools: z.array(poolNameSchema).default([]),
  })
  .loose();

/** A provider's participation in a workspace. */
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
/** One workspace's stored config. */
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

/**
 * Cuts text down to the characters a provider name may hold.
 *
 * @param text - Any text.
 * @returns Lower-cased text with each run of other characters turned into one dash and leading non-alphanumerics
 * dropped; may be empty, and is not length-limited.
 */
function toNameChars(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '');
}

/**
 * Derives a URL slug or a provider name from a display name.
 *
 * @param name - The display name.
 * @returns A value `providerNameSchema` and `workspaceSlugSchema` accept, or an empty string when the name has no usable characters.
 */
export function slugify(name: string): string {
  return toNameChars(name)
    .replace(/[-.]+$/, '') // no trailing dash/dot
    .slice(0, NAME_DEFAULTS.providerNameMaxLength);
}
