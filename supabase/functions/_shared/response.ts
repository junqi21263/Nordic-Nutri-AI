import { AppError, notImplementedError } from "./errors.ts";
import type { ErrorBody } from "./types.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export function success<T>(data: T, requestId: string, status = 200): Response {
  return Response.json({ data, request_id: requestId }, { status, headers: jsonHeaders });
}

export function failure(error: AppError, requestId: string): Response {
  const body: { error: ErrorBody; request_id: string } = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
    request_id: requestId,
  };

  return Response.json(body, { status: error.status, headers: jsonHeaders });
}

export function internalError(requestId: string): Response {
  return failure(new AppError("INTERNAL_ERROR", "Unexpected server error", 500, true), requestId);
}

export function notImplemented(requestId: string): Response {
  return failure(notImplementedError(), requestId);
}
