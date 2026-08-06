import assert from "node:assert/strict";
import test from "node:test";

import { PublicDeepseekBudgetError, createDeepseekBudgetService } from "./deepseek-budget-service.cjs";

test("assertCanCall rejects when RPC returns allowed=false", async () => {
  const db = {
    from() {},
    async rpc(name) {
      if (name === "consume_deepseek_daily_budget") {
        return { data: { allowed: false, call_used: 50, token_used: 10 }, error: null };
      }
      return { data: null, error: null };
    },
  };
  const service = createDeepseekBudgetService({ db, callLimit: 50, tokenLimit: 120000 });
  await assert.rejects(
    () => service.assertCanCall("user-1"),
    (error) => error instanceof PublicDeepseekBudgetError && error.code === "DEEPSEEK_DAILY_LIMIT_REACHED",
  );
});

test("assertCanCall admits when allowed=true", async () => {
  const db = {
    from() {},
    async rpc() {
      return { data: { allowed: true, call_used: 1, token_used: 0 }, error: null };
    },
  };
  const service = createDeepseekBudgetService({ db });
  const result = await service.assertCanCall("user-1");
  assert.equal(result.allowed, true);
  assert.equal(result.callUsed, 1);
});
