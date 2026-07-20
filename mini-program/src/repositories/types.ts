export type RepositoryMode = "fixture" | "supabase";

export type RepositoryErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION"
  | "NETWORK"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNKNOWN";

export interface RepositoryError {
  code: RepositoryErrorCode;
  message: string;
  retryable: boolean;
  requestId?: string;
}

export interface RepositoryResult<T> {
  data: T;
  requestId?: string;
}

export interface PageCursor {
  offset: number;
  limit: number;
  hasMore: boolean;
}
