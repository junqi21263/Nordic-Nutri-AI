import assert from "node:assert/strict";
import test from "node:test";

import { normalizePlan } from "./deepseek-nutrition-plan-service.cjs";

test("accepts a balanced AI nutrition plan payload", () => {
  const plan = normalizePlan({
    calories: 2500,
    proteinG: 150,
    carbsG: 275,
    fatG: 69,
    insight: "按增肌目标给出适度盈余。",
  });
  assert.ok(plan);
  assert.equal(plan.calories, 2500);
  assert.equal(plan.source, "deepseek");
});

test("rejects macros that diverge too far from calories", () => {
  const plan = normalizePlan({
    calories: 2500,
    proteinG: 50,
    carbsG: 50,
    fatG: 20,
    insight: "bad",
  });
  assert.equal(plan, null);
});
