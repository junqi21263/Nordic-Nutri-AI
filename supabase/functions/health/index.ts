import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { success } from "../_shared/response.ts";

// Deliberately dependency-free: deployment probes must not need a user JWT,
// database query, third-party secret, or request body.
Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request, "GET");
  return success({ service: "nordic-nutri-api", status: "ok" }, context.requestId);
}));
