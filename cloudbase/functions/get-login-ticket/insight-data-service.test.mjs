import assert from "node:assert/strict";
import test from "node:test";

import { createInsightDataService } from "./insight-data-service.cjs";

const meals = [
  { id: "meal-1", recordedAt: "2026-07-20T08:00:00.000Z", caloriesKcal: 500, proteinG: 40, carbsG: 50, fatG: 15 },
  { id: "meal-2", recordedAt: "2026-07-20T12:00:00.000Z", caloriesKcal: 700, proteinG: 60, carbsG: 80, fatG: 20 },
  { id: "meal-3", recordedAt: "2026-07-18T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
];

function createService() {
  return createInsightDataService({
    listMealsRange: async (_userId, from, to) => meals.filter((meal) => meal.recordedAt.slice(0, 10) >= from && meal.recordedAt.slice(0, 10) <= to),
    getNutritionPlan: async () => ({ calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }),
  });
}

test("calculates a daily nutrition summary from persisted meals and the active plan", async () => {
  const result = await createService().getDailySummary("user-1", "2026-07-20");

  assert.deepEqual(result.targets, { calories: 2400, protein: 180, carbs: 300, fat: 70 });
  assert.deepEqual(result.consumed, { calories: 1200, protein: 100, carbs: 130, fat: 35 });
  assert.deepEqual(result.remaining, { calories: 1200, protein: 80, carbs: 170, fat: 35 });
  assert.equal(result.completion, 50);
  assert.equal(result.meals.length, 2);
});

test("builds a seven-day review and server-derived achievements", async () => {
  const service = createService();
  const review = await service.getWeeklyReview("user-1", "2026-07-20");
  const achievements = await service.getAchievements("user-1", "2026-07-20");

  assert.equal(review.startDate, "2026-07-14");
  assert.equal(review.endDate, "2026-07-20");
  assert.equal(review.recordedMeals, 3);
  assert.equal(review.recordedDays, 2);
  assert.equal(review.rhythm.length, 7);
  assert.equal(review.rhythm.at(-1).date, "2026-07-20");
  assert.equal(achievements.length, 20);
  assert.equal(achievements[0].unlocked, true);
  assert.equal(achievements[3].unlocked, false);
});
