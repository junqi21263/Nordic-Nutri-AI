export interface RequestInput {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
}

export interface RequestAdapter {
  request<T>(input: RequestInput): Promise<T>;
}

export class RequestAdapterNotConfiguredError extends Error {
  constructor() {
    super("Request adapter is not configured for this environment.");
    this.name = "RequestAdapterNotConfiguredError";
  }
}
