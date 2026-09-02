import { describe, expect, it } from "vitest";
import { createCoachMealContext } from "../src/features/coach/meal-context";
import { localDailyTargets, type Meal } from "../src/features/meals/domain";

const today = "2026-08-09";

function meal(mealType: Meal["mealType"]): Meal {
  return {
    id: mealType,
    date: today,
    time: "12:00",
    title: mealType,
    mealType,
    favorite: false,
    imageKey: null,
    insight: "",
    items: [{ id: mealType, name: mealType, amount: "1份", calories: 300, protein: 20, carbs: 30, fat: 10 }],
  };
}

const summary = (consumed: Partial<typeof localDailyTargets> = {}) => ({
  ...localDailyTargets,
  consumed: { calories: 0, protein: 0, carbs: 0, fat: 0, ...consumed },
  completion: 0,
});

describe("coach meal context", () => {
  it("asks for lunch after breakfast has been recorded during lunch time", () => {
    expect(createCoachMealContext({ meals: [meal("breakfast")], summary: summary(), hour: 12 })).toMatchObject({
      summary: "早餐已记录",
      suggestion: "今日行动：午餐还没记录，按自己的节奏补上。",
      ctaLabel: "记录午餐",
      ctaAction: "record",
    });
  });

  it("asks for dinner after breakfast and lunch have been recorded", () => {
    expect(createCoachMealContext({ meals: [meal("breakfast"), meal("lunch")], summary: summary(), hour: 18 })).toMatchObject({
      suggestion: "今日行动：晚餐还差一餐，继续完成今天节奏。",
      ctaLabel: "记录晚餐",
    });
  });

  it("uses a breakfast make-up action after lunch is recorded without breakfast", () => {
    expect(createCoachMealContext({ meals: [meal("lunch")], summary: summary(), hour: 14 })).toMatchObject({
      suggestion: "今日行动：早餐可按需补记。",
      ctaLabel: "补记早餐",
    });
  });

  it("does not treat a snack-only day as having no meal records", () => {
    expect(createCoachMealContext({ meals: [meal("snack")], summary: summary({ protein: 29, calories: 283 }), hour: 17 })).toMatchObject({
      summary: "今日已记录 1 餐",
      suggestion: "今日行动：继续记录下一餐，让今天的营养进度更完整。",
      ctaLabel: "记录下一餐",
      ctaAction: "record",
    });
  });

  it("shows nutrition completion after all three meals are recorded", () => {
    expect(
      createCoachMealContext({
        meals: [meal("breakfast"), meal("lunch"), meal("dinner")],
        summary: summary({ protein: 80, calories: 1_000 }),
        hour: 20,
      }),
    ).toMatchObject({
      summary: "三餐已记录",
      suggestion: "今日行动：晚间可补一份优质蛋白，帮助完成目标。",
      ctaLabel: "查看今日进度",
      ctaAction: "progress",
    });
  });
});
