export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "AI_SERVICE_ERROR"
  | "STORAGE_ERROR"
  | "DATABASE_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: Record<string, unknown>;
  requestId: string;
}

export interface ApiFailure {
  success: false;
  error: ErrorBody;
  requestId: string;
}

export interface RequestContext {
  requestId: string;
}

export type FunctionHandler = (
  request: Request,
  context: RequestContext,
) => Promise<Response>;
