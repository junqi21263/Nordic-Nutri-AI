import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";
import { assertRequired, assertString, parseJsonBody } from "../_shared/validation.ts";

// Public endpoint: verify_jwt=false is configured in supabase/config.toml.
// WeChat code exchange and Supabase OTP creation are intentionally not implemented here.
Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  const body = await parseJsonBody(request);
  assertRequired(body, "code");
  assertString(body, "code", { minLength: 1, maxLength: 2048 });
  return notImplemented(context.requestId, "WeChat login service is not configured");
}));
