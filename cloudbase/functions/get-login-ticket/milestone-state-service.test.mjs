import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShanghaiStreak,
  buildSnapshot,
  selectActiveCycleIdsToEndBeforeActivation,
  selectHighestMilestone,
} from "./milestone-state-service.cjs";

test("buildShanghaiStreak groups valid meals into consecutive natural-day cycles", () => {
  const result = buildShanghaiStreak([
    { recordedAt: "2026-08-01T18:00:00.000Z", items: [{ name: "早餐" }] },
    { recordedAt: "2026-08-02T02:00:00.000Z", items: [{ name: "午餐" }] },
    { recordedAt: "2026-08-04T12:00:00.000Z", items: [{ name: "晚餐" }] },
    { recordedAt: "2026-08-05T12:00:00.000Z", items: [{ name: "晚餐" }] },
  ]);

  assert.deepEqual(result.cycles.map((cycle) => [cycle.startDate, cycle.endDate, cycle.days]), [
    ["2026-08-02", "2026-08-02", 1],
    ["2026-08-04", "2026-08-05", 2],
  ]);
});

test("buildShanghaiStreak ignores records without valid foods or nutrition", () => {
  const result = buildShanghaiStreak([
    { recordedAt: "2026-08-01T12:00:00.000Z", items: [] },
    { recordedAt: "2026-08-02T12:00:00.000Z", items: [{ name: "" }], caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    { recordedAt: "2026-08-03T12:00:00.000Z", items: [], caloriesKcal: 200 },
  ]);

  assert.deepEqual(result.cycles.map((cycle) => [cycle.startDate, cycle.days]), [["2026-08-03", 1]]);
});

test("selectHighestMilestone never queues lower milestones alongside the highest reached stage", () => {
  assert.equal(selectHighestMilestone(2), null);
  assert.equal(selectHighestMilestone(3), 3);
  assert.equal(selectHighestMilestone(8), 7);
  assert.equal(selectHighestMilestone(29), 14);
  assert.equal(selectHighestMilestone(30), 30);
});

test("ends a stale active cycle before activating a different canonical cycle", () => {
  const ids = selectActiveCycleIdsToEndBeforeActivation(
    [
      { id: "canonical-ended", start_date: "2026-08-10", end_date: "2026-08-12", status: "ended" },
      { id: "stale-active", start_date: "2026-07-01", end_date: "2026-07-03", status: "active" },
    ],
    [{ startDate: "2026-08-10", endDate: "2026-08-12", days: 3 }],
  );

  assert.deepEqual(ids, ["stale-active"]);
});

test("keeps the already canonical active cycle active", () => {
  const ids = selectActiveCycleIdsToEndBeforeActivation(
    [{ id: "active-canonical", start_date: "2026-08-10", end_date: "2026-08-12", status: "active" }],
    [{ startDate: "2026-08-10", endDate: "2026-08-12", days: 3 }],
  );

  assert.deepEqual(ids, []);
});

test("snapshot averages nutrients by valid recorded days and freezes matching plan targets", () => {
  const snapshot = buildSnapshot({
    userId: "user-1",
    cycle: { id: "cycle-1", start_date: "2026-08-01", end_date: "2026-08-14", days: 14 },
    milestone: 14,
    source: "backfill",
    clock: () => new Date("2026-08-14T12:00:00.000Z"),
    meals: [
      { recordedAt: "2026-08-01T02:00:00.000Z", planId: "plan-a", proteinG: 20, carbsG: 40, fatG: 10, caloriesKcal: 400, items: [{ name: "米饭 100g", foodId: null }] },
      { recordedAt: "2026-08-01T12:00:00.000Z", planId: "plan-a", proteinG: 30, carbsG: 60, fatG: 20, caloriesKcal: 600, items: [{ name: "米饭（150g）", foodId: null }] },
      { recordedAt: "2026-08-03T12:00:00.000Z", planId: "plan-a", proteinG: 50, carbsG: 100, fatG: 30, caloriesKcal: 1000, items: [{ name: "鸡胸肉", foodId: "food-chicken" }] },
    ],
    plansById: new Map([["plan-a", { id: "plan-a", version: 3, daily_calories_kcal: 2000, protein_g: 120, carbs_g: 220, fat_g: 60 }]]),
  });
  assert.equal(snapshot.statsVersion, 1);
  assert.equal(snapshot.planTargets[0].version, 3);
  assert.equal(snapshot.planTargets[0].calorieTarget, 2000);
  assert.match(snapshot.personalizedMessage, /连续记录 14 天/);
  assert.deepEqual(snapshot.highlights.map((item) => item.value), ["50g", "100g", "30g"]);
});
