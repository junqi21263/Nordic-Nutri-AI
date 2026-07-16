import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";
import { assertRequired, parseJsonBody } from "../_shared/validation.ts";

Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  const body = await parseJsonBody(request);
  assertRequired(body, "items");
  return notImplemented(context.requestId, "Nutrition calculation service is not configured");
}));
