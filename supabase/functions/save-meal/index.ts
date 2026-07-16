import { createUserScopedClient, requireUser } from "../_shared/auth.ts";
import { requireMethod, withRequestContext } from "../_shared/middleware.ts";
import { success } from "../_shared/response.ts";
import { assertRequired, parseJsonBody } from "../_shared/validation.ts";

Deno.serve(withRequestContext(async (request, context) => {
  requireMethod(request);
  await requireUser(request);
  const body = await parseJsonBody(request);
  assertRequired(body, "clientRequestId");
  assertRequired(body, "items");
  const client = createUserScopedClient(request);
  const { data, error } = await client.rpc("save_meal_atomic", { p_input: body });
  if (error) throw new Error("Meal save failed");
  return success(data, context.requestId, 200);
}));
