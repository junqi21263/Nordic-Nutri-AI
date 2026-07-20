export interface RequestErrorLike {
  status?: number;
  statusCode?: number;
  code?: string;
}

export function isUnauthorizedRequestError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as RequestErrorLike;
  return candidate.status === 401 || candidate.statusCode === 401 || candidate.code === "UNAUTHORIZED";
}
