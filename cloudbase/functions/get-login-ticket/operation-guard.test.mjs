import assert from "node:assert/strict";
import test from "node:test";
import { createOperationGuard, PublicOperationError } from "./operation-guard.cjs";

function createGuardDb(rpc) {
  return {
    rpc,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return { maybeSingle: async () => ({ data: null, error: null }) };
                    },
                  };
                },
              };
            },
          };
        },
        insert() {
          return {
            select() {
              return { single: async () => ({ data: { request_count: 1 }, error: null }) };
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        select() {
                          return { single: async () => ({ data: { request_count: 1 }, error: null }) };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("claims an operation once and returns its completed response to a retry", async () => {
  const calls = [];
  const responses = [{ data: [{ state: "started", claimed: true }] }, { data: [{ state: "succeeded", response: { deleted: true }, claimed: false }] }];
  const guard = createOperationGuard({ db: createGuardDb(async (name, input) => { calls.push([name, input]); return responses.shift(); }) });
  assert.deepEqual(await guard.claim("user-a", "account_cancel", "11111111-1111-4111-8111-111111111111"), { response: null, reused: false });
  assert.deepEqual(await guard.claim("user-a", "account_cancel", "11111111-1111-4111-8111-111111111111"), { response: { deleted: true }, reused: true });
  assert.equal(calls[0][0], "claim_operation_request");
});

test("rejects a duplicate operation still in progress", async () => {
  const guard = createOperationGuard({ db: createGuardDb(async () => ({ data: [{ state: "started", claimed: false }] })) });
  await assert.rejects(
    () => guard.claim("user-a", "account_cancel", "11111111-1111-4111-8111-111111111111"),
    (error) => error instanceof PublicOperationError && error.code === "OPERATION_IN_PROGRESS",
  );
});
