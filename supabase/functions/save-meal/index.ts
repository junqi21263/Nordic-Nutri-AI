import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";
import { assertRequired, parseJsonBody } from "../_shared/validation.ts";

Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  const body = await parseJsonBody(request);
  assertRequired(body, "clientRequestId");
  assertRequired(body, "items");
  return notImplemented(context.requestId, "Atomic meal save service is not configured");
}));
