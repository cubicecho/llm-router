import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import type { AuthConfig } from '../config/effective-auth.ts';
import { forbidden, type HttpError, sendError, unauthenticated } from '../core/errors.ts';

// Until the tests that read these from here have moved.
export { type AuthConfig, effectiveAuth } from '../config/effective-auth.ts';

/** Writes a refusal in the envelope the path's callers expect. */
export type ErrorResponder = (res: Response, error: HttpError) => void;

/**
 * Compares two tokens in constant time, without leaking their length (it compares sha256 digests).
 *
 * @param a - One token.
 * @param b - The other token.
 * @returns True when the tokens are identical.
 */
export function tokensEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Tells whether an origin is a loopback one, which a remote attacker cannot forge.
 *
 * @param origin - An `Origin` header value.
 * @returns True for localhost, 127.0.0.1 or ::1 on any port; false for anything else, an unparsable value included.
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Builds the DNS-rebinding guard for /v1, which rejects a disallowed `Origin` with 403.
 *
 * @param getAllowedOrigins - The operator-configured origins, read on every request.
 * @param [reject] - Writes the refusal.
 * @returns Middleware that passes requests with no Origin, a loopback one or an allowed one.
 *
 * @remarks
 * Browsers attach an `Origin` header a page cannot spoof, so a rebound request from a malicious site carries that
 * site's origin. Native OpenAI clients send no Origin at all.
 */
export function createOriginMiddleware(
  getAllowedOrigins: () => string[],
  reject: ErrorResponder = sendError,
): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.origin;
    const origin = Array.isArray(header) ? header[0] : header;
    if (!origin || isLoopbackOrigin(origin) || getAllowedOrigins().includes(origin)) {
      next();
      return;
    }
    reject(res, forbidden(`Origin "${origin}" is not allowed`));
  };
}

/**
 * Builds the bearer-token middleware for /api and /v1.
 *
 * @param getAuth - The auth in force, read on every request.
 * @param [reject] - Writes the refusal.
 * @returns Middleware that passes everything when auth is disabled, and otherwise answers a missing or wrong token
 * with a 401.
 */
export function createAuthMiddleware(getAuth: () => AuthConfig, reject: ErrorResponder = sendError): RequestHandler {
  return (req, res, next) => {
    const { enabled, token } = getAuth();
    if (enabled === false) {
      next();
      return;
    }
    if (!token) {
      reject(res, unauthenticated('Auth is enabled but no token is configured'));
      return;
    }
    const header = req.headers.authorization;
    const provided = header?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!provided || !tokensEqual(provided, token)) {
      reject(res, unauthenticated('Unauthorized'));
      return;
    }
    next();
  };
}
