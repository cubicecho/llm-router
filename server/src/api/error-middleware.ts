import { type ApiError, ErrorCode } from '@llm-router/shared';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  badInput,
  exposedClientError,
  HttpError,
  INTERNAL_ERROR_MESSAGE,
  internal,
  sendError,
} from '../core/errors.ts';

/**
 * Renders every thrown error as the JSON envelope { error, code, detail? }.
 *
 * @param err - The thrown value; anything unrecognised is logged and sent as a 500 with a fixed message.
 * @param _req - Unused.
 * @param res - The response to write.
 * @param _next - Unused.
 */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const detail = err.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    sendError(res, badInput('Validation failed', detail));
    return;
  }
  if (err instanceof HttpError) {
    sendError(res, err);
    return;
  }
  const clientError = exposedClientError(err);
  if (clientError) {
    const body: ApiError = { error: clientError.message, code: ErrorCode.BadUserInput };
    res.status(clientError.status).json(body);
    return;
  }
  console.error('[api] unhandled error:', err);
  sendError(res, internal(INTERNAL_ERROR_MESSAGE));
}
