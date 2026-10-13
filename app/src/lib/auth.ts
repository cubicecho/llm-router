// Bearer-token storage plus a tiny external store for the token and the "needs auth" flag. The fetch wrapper raises
// the flag on any 401; the root layout watches it and swaps in the token-entry screen.
import { useSyncExternalStore } from 'react';

/** The `localStorage` key the bearer token is kept under. */
export const TOKEN_STORAGE_KEY = 'llm-router-token';

/** A subscriber to the token and the needs-auth flag. */
type Listener = () => void;

/** Whether the router has refused the stored token, or there is none and it wants one. */
let needsAuth = false;
/** Everyone to tell when the token or the flag changes. */
const listeners = new Set<Listener>();

/** Tells every subscriber the token or the needs-auth flag changed. */
function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Reads the stored bearer token.
 *
 * @returns The token, or null when none is stored.
 */
export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Stores the bearer token and lowers the needs-auth flag.
 *
 * @param token - The token to send on every API request.
 */
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  needsAuth = false;
  emit();
}

/** Forgets the stored bearer token; the needs-auth flag is left as it is. */
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  emit();
}

/** Raises the needs-auth flag; the API client calls it whenever a request comes back 401. */
export function requireAuth(): void {
  if (!needsAuth) {
    needsAuth = true;
    emit();
  }
}

/**
 * Reads the needs-auth flag.
 *
 * @returns true once a request has come back 401 and no token has been set since.
 */
export function getNeedsAuth(): boolean {
  return needsAuth;
}

/**
 * Subscribes to changes of the token and the needs-auth flag.
 *
 * @param listener - Called with nothing on every change.
 * @returns The unsubscribe function.
 *
 * @remarks
 * A `storage` event is a change too: it is how this tab hears that another one stored or forgot the token.
 */
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Subscribes a component to the needs-auth flag.
 *
 * @returns true while the token-entry screen should be shown.
 */
export function useNeedsAuth(): boolean {
  return useSyncExternalStore(subscribe, getNeedsAuth);
}

/**
 * Subscribes a component to the stored bearer token.
 *
 * @returns The token, or null when none is stored; the component renders again when it changes.
 */
export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken);
}
