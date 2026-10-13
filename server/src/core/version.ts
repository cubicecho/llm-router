import { readFileSync } from 'node:fs';
import { isRecord } from './is-record.ts';

/** The version reported when package.json cannot tell. */
const UNKNOWN_VERSION = '0.0.0';

/**
 * Reads the released version from the root package.json.
 *
 * @returns The version, or `0.0.0` when the file is missing, unreadable or has none.
 *
 * @remarks
 * semantic-release bumps that file at release time and the Dockerfile copies it into the runtime image. The path is
 * three levels up from this module in both dev (`server/src/core/version.ts`) and prod (`server/dist/core/version.js`).
 */
function readVersion(): string {
  try {
    const pkgUrl = new URL('../../../package.json', import.meta.url);
    const pkg: unknown = JSON.parse(readFileSync(pkgUrl, 'utf8'));
    const version = isRecord(pkg) ? pkg.version : undefined;
    return typeof version === 'string' ? version : UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}

/** Version reported in RouterStatus and /healthz, read once at load. */
export const SERVER_VERSION = readVersion();
