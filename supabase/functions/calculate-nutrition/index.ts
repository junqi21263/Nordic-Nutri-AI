import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { notImplemented } from "../_shared/response.ts";

Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  return notImplemented(context.requestId);
}));
