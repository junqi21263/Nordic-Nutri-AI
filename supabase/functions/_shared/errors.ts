import type { ErrorCode } from "./types.ts";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) =>
  new AppError("BAD_REQUEST", message, 400);

export const methodNotAllowed = (message = "Method not allowed") =>
  new AppError("METHOD_NOT_ALLOWED", message, 405);

export const unauthorized = (message = "Authentication is required") =>
  new AppError("UNAUTHORIZED", message, 401);

export const notImplementedError = () =>
  new AppError("NOT_IMPLEMENTED", "This endpoint is not implemented", 501);
