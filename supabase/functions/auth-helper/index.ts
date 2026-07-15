import { requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { success } from "../_shared/response.ts";

// Development-only identity endpoint. It exercises the same Bearer JWT boundary
// future protected Functions use, without exposing tokens or privileged metadata.
Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  const user = await requireUser(request);

  return success({
    user: {
      id: user.id,
      email: user.email ?? null,
    },
  }, context.requestId);
}));
