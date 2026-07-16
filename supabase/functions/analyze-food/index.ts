import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";
import { assertRequired, assertString, parseJsonBody } from "../_shared/validation.ts";

// AI, image processing, Storage reads, and provider calls are intentionally absent.
Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  const body = await parseJsonBody(request);
  assertRequired(body, "objectPath");
  assertString(body, "objectPath", { minLength: 1, maxLength: 512 });
  assertString(body, "sha256", { minLength: 64, maxLength: 64 });
  return notImplemented(context.requestId, "Food analysis service is not configured");
}));
