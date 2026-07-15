import { AppError, methodNotAllowed } from "./errors.ts";
import { failure, internalError } from "./response.ts";
import type { FunctionHandler } from "./types.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-request-id",
  "access-control-allow-methods": "POST, OPTIONS",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export function requireMethod(request: Request, method = "POST"): void {
  if (request.method !== method) throw methodNotAllowed();
}

export function withRequestContext(handler: FunctionHandler) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      return withCors(await handler(request, { requestId }));
    } catch (error) {
      if (error instanceof AppError) return withCors(failure(error, requestId));
      console.error(JSON.stringify({ request_id: requestId, event: "unhandled_function_error" }));
      return withCors(internalError(requestId));
    }
  };
}
