import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAchievements,
  calculateDailyNutrition,
  calculateWeeklyNutrition,
} from "./nutrition-calculation-service.cjs";

test("calculates nutrient progress independently and keeps over-target values explicit", () => {
  const result = calculateDailyNutrition(
    [
      { caloriesKcal: 2700, proteinG: 190, carbsG: 250, fatG: 80 },
      { caloriesKcal: 100, proteinG: 5, carbsG: 20, fatG: 2 },
    ],
    { calories: 2600, proteinG: 180, carbsG: 300, fatG: 70 },
  );

  assert.deepEqual(result.consumed, { calories: 2800, protein: 195, carbs: 270, fat: 82 });
  assert.deepEqual(result.remaining, { calories: 0, protein: 0, carbs: 30, fat: 0 });
  assert.deepEqual(result.excess, { calories: 200, protein: 15, carbs: 0, fat: 12 });
  assert.equal(result.progress.calories.percent, 100);
  assert.equal(result.progress.carbs.percent, 90);
  assert.equal(result.completion, 98);
});

test("scores a week against seven daily targets instead of the number of recorded days", () => {
  const meals = [
    { recordedAt: "2026-07-14T08:00:00.000Z", caloriesKcal: 2400, proteinG: 180, carbsG: 300, fatG: 70 },
    { recordedAt: "2026-07-20T08:00:00.000Z", caloriesKcal: 2400, proteinG: 180, carbsG: 300, fatG: 70 },
  ];
  const result = calculateWeeklyNutrition(meals, { calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }, "2026-07-20");

  assert.equal(result.recordedDays, 2);
  assert.equal(result.proteinCompletion, 29);
  assert.equal(result.calorieCompletion, 29);
  assert.equal(result.consistency, 29);
  assert.equal(result.score, 29);
});

test("does not unlock achievements without matching records", () => {
  const result = calculateAchievements([], { calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }, "2026-07-20");
  assert.equal(result[0].unlocked, false);
  assert.equal(result[0].progress, 0);
  assert.equal(result.find((item) => item.title === "水分自律").available, false);
});

test("counts vegetable achievement only from meal or item names", () => {
  const meals = [
    { recordedAt: "2026-07-20T08:00:00.000Z", title: "鸡胸肉配西兰花", mealType: "lunch", proteinG: 40, carbsG: 50, fatG: 10 },
    { recordedAt: "2026-07-19T08:00:00.000Z", title: "鸡胸肉米饭", mealType: "lunch", proteinG: 40, carbsG: 50, fatG: 10, items: [{ name: "菠菜", proteinG: 2, carbsG: 3 }] },
    { recordedAt: "2026-07-18T08:00:00.000Z", title: "鸡胸肉米饭", mealType: "lunch", proteinG: 40, carbsG: 50, fatG: 10 },
  ];
  const achievement = calculateAchievements(meals, {}, "2026-07-20").find((item) => item.title === "蔬菜优先");
  assert.equal(achievement.metric, 2);
  assert.equal(achievement.unlocked, false);
});

test("unlocks the first meal and a real seven-day streak from persisted meals", () => {
  const meals = Array.from({ length: 7 }, (_, index) => ({
    recordedAt: `2026-07-${String(14 + index).padStart(2, "0")}T08:00:00.000Z`,
    mealType: "breakfast",
    caloriesKcal: 500,
    proteinG: 40,
    carbsG: 60,
    fatG: 15,
  }));
  const result = calculateAchievements(meals, { calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }, "2026-07-20");
  assert.equal(result.find((item) => item.title === "第一餐记录").unlocked, true);
  assert.equal(result.find((item) => item.title === "连续七天").unlocked, true);
  assert.equal(result.find((item) => item.title === "连续七天").progress, 100);
});
