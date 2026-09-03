import assert from "node:assert/strict";
import test from "node:test";
import { createVisionBudget } from "./vision-budget.cjs";

test("production vision defaults leave enough time for a slow visual provider", async () => {
  const { VISION_BUDGETS } = await import("./vision-budget.cjs");

  assert.equal(VISION_BUDGETS.serverTotalMs, 30_000);
  assert.equal(VISION_BUDGETS.flashMaxMs, 18_000);
});

test("vision budget exposes one absolute deadline and remaining time", () => {
  const budget = createVisionBudget({ now: () => 1_000, totalMs: 12_500 });

  assert.equal(budget.startedAt, 1_000);
  assert.equal(budget.deadlineAt, 13_500);
  assert.equal(budget.remainingMs(4_000), 9_500);
  assert.equal(budget.remainingMs(14_000), 0);
});

test("remainingAfterReserve never allows optional work to consume mandatory reserve", () => {
  const budget = createVisionBudget({ now: () => 1_000, totalMs: 12_500 });

  assert.equal(budget.remainingAfterReserve(2_500, 4_000), 7_000);
  assert.equal(budget.remainingAfterReserve(10_000, 4_000), 0);
});

test("stageTimeout is bounded by both stage cap and downstream reserve", () => {
  const budget = createVisionBudget({ now: () => 1_000, totalMs: 12_500 });

  assert.equal(budget.stageTimeout(6_000, 4_000, 4_000), 5_500);
  assert.equal(budget.stageTimeout(6_000, 10_000, 4_000), 0);
});
