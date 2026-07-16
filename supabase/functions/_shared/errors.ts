import type { ErrorCode } from "./types.ts";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) =>
  new AppError("VALIDATION_ERROR", message, 400);

export const validationError = (message: string, details?: Record<string, unknown>) =>
  new AppError("VALIDATION_ERROR", message, 400, false, details);

export const methodNotAllowed = (message = "Method not allowed") =>
  new AppError("METHOD_NOT_ALLOWED", message, 405);

export const unauthorized = (message = "Authentication is required") =>
  new AppError("UNAUTHORIZED", message, 401);

export const notImplementedError = (message = "This endpoint is not implemented") =>
  new AppError("NOT_IMPLEMENTED", message, 501);
