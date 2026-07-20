import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";
import { parseJsonBody } from "../_shared/validation.ts";

Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  await parseJsonBody(request);
  return notImplemented(context.requestId, "Meal summary service is not configured");
}));
