import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";

// Public endpoint: verify_jwt=false is configured in supabase/config.toml.
// WeChat code exchange and Supabase OTP creation are intentionally not implemented here.
Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  return notImplemented(context.requestId);
}));
