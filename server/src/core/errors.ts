import { type ApiError, ErrorCode, HttpStatus } from '@llm-router/shared';
import type { Response } from 'express';
import { isRecord } from './is-record.ts';

/** The HTTP status each error code is sent with. */
const STATUS_BY_CODE = {
  [ErrorCode.BadUserInput]: HttpStatus.BadRequest,
  [ErrorCode.Unauthenticated]: HttpStatus.Unauthorized,
  [ErrorCode.Forbidden]: HttpStatus.Forbidden,
  [ErrorCode.NotFound]: HttpStatus.NotFound,
  [ErrorCode.Conflict]: HttpStatus.Conflict,
  [ErrorCode.Internal]: HttpStatus.InternalServerError,
  [ErrorCode.UpstreamFailed]: HttpStatus.BadGateway,
  [ErrorCode.Unavailable]: HttpStatus.ServiceUnavailable,
  [ErrorCode.UpstreamTimeout]: HttpStatus.GatewayTimeout,
} as const satisfies Record<ErrorCode, HttpStatus>;

/** An error carrying an error code; rendered as the envelope { error, code, detail? } with the code's HTTP status. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  /** The HTTP status `code` maps to. */
  readonly status: HttpStatus;
  /** Diagnostics beyond the one-line message, e.g. a child's stderr tail. */
  readonly detail?: string;

  /**
   * Builds the error, taking its HTTP status from the code.
   *
   * @param code - Decides the HTTP status.
   * @param message - The envelope's `error`.
   * @param [detail] - The envelope's `detail`; left out of it when empty.
   * @param [options] - Carries the `cause`.
   */
  constructor(code: ErrorCode, message: string, detail?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HttpError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.detail = detail;
  }
}

/** Builds an HttpError of one code from a message, an optional detail and an optional cause. */
type HttpErrorFactory = (message: string, detail?: string, options?: ErrorOptions) => HttpError;

/**
 * Makes the factory for one error code.
 *
 * @param code - The code every error it builds carries.
 * @returns A factory taking the message, an optional detail and an optional cause.
 */
const factoryFor =
  (code: ErrorCode): HttpErrorFactory =>
  (message, detail, options) =>
    new HttpError(code, message, detail, options);

/** What a 500 says. The cause goes to the log, never to the caller: it can name files on the host. */
export const INTERNAL_ERROR_MESSAGE = 'Internal server error';

/** Builds a 400 for input the caller got wrong. */
export const badInput = factoryFor(ErrorCode.BadUserInput);
/** Builds a 401 for a missing or wrong credential. */
export const unauthenticated = factoryFor(ErrorCode.Unauthenticated);
/** Builds a 403 for a request that is not allowed. */
export const forbidden = factoryFor(ErrorCode.Forbidden);
/** Builds a 404 for something that does not exist. */
export const notFound = factoryFor(ErrorCode.NotFound);
/** Builds a 409 for a clash with what already exists. */
export const conflict = factoryFor(ErrorCode.Conflict);
/** Builds a 500 for a failure of the router's own. */
export const internal = factoryFor(ErrorCode.Internal);
/** Builds a 502 for a provider that failed or could not be reached. */
export const upstreamFailed = factoryFor(ErrorCode.UpstreamFailed);
/** Builds a 503 for something that cannot be reached right now. */
export const unavailable = factoryFor(ErrorCode.Unavailable);
/** Builds a 504 for a provider that did not answer in time. */
export const upstreamTimeout = factoryFor(ErrorCode.UpstreamTimeout);

/**
 * Sends an error as the JSON envelope, with the status its code maps to.
 *
 * @param res - The response to write.
 * @param error - The error to render.
 */
export function sendError(res: Response, error: HttpError): void {
  const body: ApiError = { error: error.message, code: error.code, ...(error.detail ? { detail: error.detail } : {}) };
  res.status(error.status).json(body);
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * @param err - The thrown value.
 * @returns An Error's message, or the value as a string.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * Reads the status and message of an error Express's own middleware marked as safe to show.
 *
 * @param err - The thrown value.
 * @returns The status and message to send, or undefined for any other error.
 *
 * @remarks
 * Express raises these for a bad request, such as a malformed or oversized body.
 */
export function exposedClientError(err: unknown): { status: number; message: string } | undefined {
  if (isRecord(err) && err.expose === true && typeof err.status === 'number' && typeof err.message === 'string') {
    return { status: err.status, message: err.message };
  }
  return undefined;
}
