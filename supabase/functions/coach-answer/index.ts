import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";
import { assertRequired, assertString, parseJsonBody } from "../_shared/validation.ts";

// This skeleton does not contain prompts, provider integrations, or AI logic.
Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  const body = await parseJsonBody(request);
  assertRequired(body, "message");
  assertString(body, "message", { minLength: 1, maxLength: 4000 });
  return notImplemented(context.requestId, "Coach response service is not configured");
}));
