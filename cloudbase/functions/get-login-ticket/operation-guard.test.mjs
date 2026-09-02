import assert from "node:assert/strict";
import test from "node:test";
import { createOperationGuard } from "./operation-guard.cjs";

test("commitVisionQuota sends a plain JSON response to the quota RPC", async () => {
  let rpcInput;
  const guard = createOperationGuard({
    db: {
      from: () => ({}),
      rpc: async (_name, input) => {
        rpcInput = input;
        return { data: [{ state: "committed", response: input.p_response }], error: null };
      },
    },
  });
  const response = { analysisId: "analysis-1", items: [{ name: "米饭" }], optional: undefined };
  const result = await guard.commitVisionQuota("user-1", "11111111-1111-4111-8111-111111111111", response);
  assert.equal(result.committed, true);
  assert.deepEqual(rpcInput.p_response, { analysisId: "analysis-1", items: [{ name: "米饭" }] });
});

test("commitVisionQuota retries a transient RPC failure", async () => {
  let calls = 0;
  const guard = createOperationGuard({
    db: {
      from: () => ({}),
      rpc: async () => {
        calls += 1;
        if (calls === 1) return { data: null, error: new Error("transient") };
        return { data: [{ state: "committed", response: { ok: true } }], error: null };
      },
    },
  });
  const result = await guard.commitVisionQuota("user-1", "11111111-1111-4111-8111-111111111111", { ok: true });
  assert.equal(result.committed, true);
  assert.equal(calls, 2);
});

test("commitVisionQuota confirms an empty RPC payload through the server table path", async () => {
  let updateInput;
  const chain = {
    update: (input) => { updateInput = input; return chain; },
    eq: () => chain,
    in: () => chain,
    select: () => chain,
    maybeSingle: async () => ({ data: { state: "committed", response: { ok: true } }, error: null }),
  };
  const guard = createOperationGuard({
    db: {
      from: () => chain,
      rpc: async () => ({ data: [], error: null }),
    },
  });
  const result = await guard.commitVisionQuota("user-1", "11111111-1111-4111-8111-111111111111", { ok: true });
  assert.equal(result.committed, true);
  assert.equal(updateInput.state, "committed");
});
