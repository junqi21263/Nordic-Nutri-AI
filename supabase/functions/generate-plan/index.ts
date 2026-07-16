import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";
import { assertRequired, assertString, parseJsonBody } from "../_shared/validation.ts";

Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  const body = await parseJsonBody(request);
  assertRequired(body, "bodyProfileId");
  assertString(body, "bodyProfileId", { minLength: 36, maxLength: 36 });
  assertString(body, "healthGoalId", { minLength: 36, maxLength: 36 });
  return notImplemented(context.requestId, "Health plan generation service is not configured");
}));
