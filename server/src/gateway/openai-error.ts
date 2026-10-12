import { ErrorCode, type OpenAiErrorBody } from '@llm-router/shared';
import type { NextFunction, Request, Response } from 'express';
import { exposedClientError, HttpError, internal } from '../core/errors.ts';

/** OpenAI's error `type` for a request the caller got wrong. */
const INVALID_REQUEST = 'invalid_request_error';
/** OpenAI's error `type` for a failure on the serving side. */
const API_ERROR = 'api_error';
/** The `code` OpenAI's SDKs know for a model that is not there. */
const MODEL_NOT_FOUND = 'model_not_found';

/** OpenAI's `type` and `code` for each of the router's error codes. */
const OPENAI_ERROR_BY_CODE = {
  [ErrorCode.BadUserInput]: { type: INVALID_REQUEST, code: 'invalid_request' },
  [ErrorCode.Unauthenticated]: { type: 'authentication_error', code: 'invalid_api_key' },
  [ErrorCode.Forbidden]: { type: 'permission_error', code: 'forbidden' },
  [ErrorCode.NotFound]: { type: INVALID_REQUEST, code: 'not_found' },
  [ErrorCode.Conflict]: { type: INVALID_REQUEST, code: 'conflict' },
  [ErrorCode.Internal]: { type: API_ERROR, code: 'internal_error' },
  [ErrorCode.UpstreamFailed]: { type: API_ERROR, code: 'upstream_failed' },
  [ErrorCode.Unavailable]: { type: API_ERROR, code: 'unavailable' },
  [ErrorCode.UpstreamTimeout]: { type: API_ERROR, code: 'upstream_timeout' },
} as const satisfies Record<ErrorCode, { type: string; code: string }>;

/** A 404 for a model the endpoint does not serve, sent with OpenAI's `model_not_found` code. */
export class ModelNotFoundError extends HttpError {
  /**
   * Builds the error.
   *
   * @param model - The id the client asked for.
   */
  constructor(model: string) {
    super(ErrorCode.NotFound, `The model "${model}" does not exist on this endpoint. Ids read <provider>/<model>.`);
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Send an error as OpenAI's JSON envelope, with the status its code maps to.
 *
 * @param res - The response to write.
 * @param error - The error to render.
 */
export function sendOpenAiError(res: Response, error: HttpError): void {
  const { type, code } = OPENAI_ERROR_BY_CODE[error.code];
  const message = error.detail ? `${error.message}: ${error.detail}` : error.message;
  const body: OpenAiErrorBody = {
    error: { message, type, param: null, code: error instanceof ModelNotFoundError ? MODEL_NOT_FOUND : code },
  };
  res.status(error.status).json(body);
}

/**
 * Renders every error thrown under a /v1 path as OpenAI's envelope.
 *
 * @param err - The thrown value; anything unrecognised is logged and sent as a 500 with a fixed message.
 * @param _req - Unused.
 * @param res - The response to write.
 * @param next - Handed the error when the response has already started, so Express closes the connection.
 */
export function openAiErrorMiddleware(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    sendOpenAiError(res, err);
    return;
  }
  const clientError = exposedClientError(err);
  if (clientError) {
    const body: OpenAiErrorBody = {
      error: { message: clientError.message, type: INVALID_REQUEST, param: null, code: 'invalid_request' },
    };
    res.status(clientError.status).json(body);
    return;
  }
  console.error('[gateway] unhandled error:', err);
  sendOpenAiError(res, internal('Internal server error'));
}
