import type { SettingsFile } from '@llm-router/shared';
import { authDisabledByEnv, envToken } from './env.ts';

/** The auth in force for a request. */
export interface AuthConfig {
  /** False lets every request through. */
  enabled: boolean;
  /** The bearer token to match; null means none is configured, so every request is refused while enabled. */
  token: string | null;
}

/**
 * Resolves the auth actually in force: settings.json, as overridden by the environment.
 *
 * @param settings - The stored auth settings.
 * @param [env] - Read for `SECURE_LOCAL_NET`, which turns auth off, and `LLM_ROUTER_TOKEN`, which replaces the token.
 * @returns Whether auth is on, and the token to match.
 */
export function effectiveAuth(
  settings: Pick<SettingsFile, 'authEnabled' | 'authToken'>,
  env?: NodeJS.ProcessEnv,
): AuthConfig {
  return {
    enabled: settings.authEnabled && !authDisabledByEnv(env),
    token: envToken(env) ?? settings.authToken,
  };
}
