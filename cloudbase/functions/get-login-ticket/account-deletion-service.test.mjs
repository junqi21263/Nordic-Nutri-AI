import assert from "node:assert/strict";
import test from "node:test";
import { createAccountDeletionService, PublicAccountDeletionError } from "./account-deletion-service.cjs";

test("cancels only the authenticated product account after deleting its private files", async () => {
  const events = [];
  const service = createAccountDeletionService({
    db: {
      from(table) {
        if (table === "uploaded_assets") return { select: () => ({ eq: async () => ({ data: [{ object_path: "food-images/user-a/scan.jpg" }], error: null }) }) };
        if (table === "profiles") return { select: () => ({ eq: async () => ({ data: [{ avatar_path: "avatars/user-a/avatar.jpg" }], error: null }) }) };
        if (table === "ai_analysis") return { select: () => ({ eq: async () => ({ data: [{ image_path: "food-images/user-a/scan.jpg" }], error: null }) }) };
        if (table === "meal_records") return { select: () => ({ eq: async () => ({ data: [{ image_path: "food-images/user-a/meal.jpg" }], error: null }) }) };
        if (table === "app_users") return { delete: () => ({ eq: async (column, value) => { events.push(["db", column, value]); return { error: null }; } }) };
        throw new Error(`unexpected table ${table}`);
      },
    },
    deleteFiles: async ({ cloudPaths }) => events.push(["storage", cloudPaths]),
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });

  const result = await service.cancelAccount("user-a", {
    confirmation: "DELETE_MY_NORDIC_NUTRI_ACCOUNT",
    clientRequestId: "11111111-1111-4111-8111-111111111111",
  });

  assert.deepEqual(result, { deleted: true });
  assert.deepEqual(events, [
    ["storage", ["food-images/user-a/scan.jpg", "avatars/user-a/avatar.jpg", "food-images/user-a/meal.jpg"]],
    ["db", "id", "user-a"],
  ]);
});

test("requires the fixed cancellation confirmation", async () => {
  const service = createAccountDeletionService({ db: { from: () => { throw new Error("must not query"); } }, deleteFiles: async () => {} });
  await assert.rejects(
    () => service.cancelAccount("user-a", { confirmation: "delete" }),
    (error) => error instanceof PublicAccountDeletionError && error.code === "ACCOUNT_CANCELLATION_CONFIRMATION_REQUIRED",
  );
});

test("requires a client request ID so cancellation retries can be deduplicated server-side", async () => {
  const service = createAccountDeletionService({ db: { from: () => { throw new Error("must not query"); } }, deleteFiles: async () => {} });
  await assert.rejects(
    () => service.cancelAccount("user-a", { confirmation: "DELETE_MY_NORDIC_NUTRI_ACCOUNT", clientRequestId: "invalid" }),
    (error) => error instanceof PublicAccountDeletionError && error.code === "ACCOUNT_CANCELLATION_REQUEST_INVALID",
  );
});

test("does not delete files again when the idempotency guard has a completed cancellation", async () => {
  const service = createAccountDeletionService({
    db: { from: () => { throw new Error("must not query"); } },
    deleteFiles: async () => { throw new Error("must not delete"); },
    operationGuard: { claim: async () => ({ reused: true, response: { deleted: true } }) },
  });
  assert.deepEqual(await service.cancelAccount("user-a", {
    confirmation: "DELETE_MY_NORDIC_NUTRI_ACCOUNT",
    clientRequestId: "11111111-1111-4111-8111-111111111111",
  }), { deleted: true });
});
