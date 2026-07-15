export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface RequestContext {
  requestId: string;
}

export type FunctionHandler = (
  request: Request,
  context: RequestContext,
) => Promise<Response>;
