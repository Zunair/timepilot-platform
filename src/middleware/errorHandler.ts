/**
 * Error Handling Middleware
 * 
 * Centralizes error handling and response formatting.
 * Converts application errors to consistent HTTP responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ErrorResponse, ClientError } from '../types/index.js';

/**
 * Express error handling middleware
 * Must be registered as the last middleware to catch all errors
 */
export function errorHandler(
  err: Error | ClientError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode =
    'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;

  const response: ErrorResponse = {
    error: 'code' in err ? err.code : 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred',
    statusCode,
    timestamp: new Date().toISOString(),
  };

  // Log errors
  if (statusCode >= 500) {
    console.error('[ERROR]', err);
  } else {
    console.warn('[WARN]', err.message);
  }

  res.status(statusCode).json(response);
}

/**
 * Convert standard Error to ClientError for more detailed responses
 */
export function createClientError(
  message: string,
  code: string,
  statusCode: number = 400,
  details?: Record<string, unknown>
): ClientError {
  return {
    message,
    code,
    statusCode,
    details,
  };
}
