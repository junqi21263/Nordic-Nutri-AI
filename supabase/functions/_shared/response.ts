import { AppError, notImplementedError } from "./errors.ts";
import type { ApiFailure, ApiSuccess } from "./types.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export function success<T>(
  data: T,
  requestId: string,
  status = 200,
  meta: Record<string, unknown> = {},
): Response {
  const body: ApiSuccess<T> = { success: true, data, meta, requestId };
  return Response.json(body, { status, headers: jsonHeaders });
}

export function failure(error: AppError, requestId: string): Response {
  const body: ApiFailure = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    },
    requestId,
  };

  return Response.json(body, { status: error.status, headers: jsonHeaders });
}

export function internalError(requestId: string): Response {
  return failure(new AppError("INTERNAL_ERROR", "Unexpected server error", 500, true), requestId);
}

export function notImplemented(requestId: string, message?: string): Response {
  return failure(notImplementedError(message), requestId);
}
