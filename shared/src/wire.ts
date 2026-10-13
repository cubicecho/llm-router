/** The HTTP statuses the router sends, and its UI and tests read. */
export const HttpStatus = {
  Ok: 200,
  Created: 201,
  NoContent: 204,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} as const;
/** One of the {@link HttpStatus} codes. */
export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

/** Why a request failed, as the error envelope's `code`. Callers branch on this, never on the message. */
export const ErrorCode = {
  BadUserInput: 'BAD_USER_INPUT',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  Internal: 'INTERNAL',
  /** A provider answered with a failure or could not be reached. */
  UpstreamFailed: 'UPSTREAM_FAILED',
  /** Something the request needs cannot be used right now. */
  Unavailable: 'UNAVAILABLE',
  UpstreamTimeout: 'UPSTREAM_TIMEOUT',
} as const;
/** One of the {@link ErrorCode} values. */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
