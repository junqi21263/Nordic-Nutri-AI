import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("persisted insight API boundary", () => {
  it("exposes authenticated daily, weekly, achievement, range, and detail reads", () => {
    const insightApi = read("src/api/insight-api.ts");
    const mealApi = read("src/api/meal-data-api.ts");

    expect(insightApi).toContain("getProductDailySummary");
    expect(insightApi).toContain("getProductWeeklyReview");
    expect(insightApi).toContain("getProductAchievements");
    expect(insightApi).toContain("/meal-summary?date=");
    expect(insightApi).toContain("/weekly-review?date=");
    expect(insightApi).toContain("/achievements?date=");
    expect(mealApi).toContain("getProductMealsRange");
    expect(mealApi).toContain("getProductMeal");
  });

  it("loads weekly reviews and achievements from the server without changing their page structure", () => {
    const weeklyPage = read("src/pages/weekly-review/index.tsx");
    const achievementsPage = read("src/pages/achievements/index.tsx");

    expect(weeklyPage).toContain("getProductWeeklyReview");
    expect(achievementsPage).toContain("getProductAchievements");
    expect(weeklyPage).not.toContain("基于当前设备中的记录生成");
    expect(achievementsPage).not.toContain("所有成就均根据当前设备中的记录计算");
  });
});
