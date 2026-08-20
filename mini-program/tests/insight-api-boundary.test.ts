import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("persisted insight API boundary", () => {
  it("exposes authenticated daily, weekly, achievement, range, and detail reads", () => {
    const insightApi = read("src/api/insight-api.ts");
    const mealApi = read("src/api/meal-data-api.ts");

    expect(insightApi).toContain("getProductDailySummary");
    expect(insightApi).toContain("ProductDailyInsight");
    expect(insightApi).toContain("getProductWeeklyReview");
    expect(insightApi).toContain("getProductAchievements");
    expect(insightApi).toContain("serverTime: string");
    expect(insightApi).toContain("/meal-summary?");
    expect(insightApi).toContain("/weekly-review?");
    expect(insightApi).toContain('preferFast');
    expect(insightApi).toContain('light?: boolean');
    expect(insightApi).toContain('summaryInflight');
    expect(insightApi).toContain("/achievements?date=");
    expect(mealApi).toContain("getProductMealsRange");
    expect(mealApi).toContain("light");
    expect(mealApi).toContain("getProductMeal");
  });

  it("uses the daily-summary server time and persisted insight for the home greeting and card", () => {
    const homePage = read("src/pages/home/index.tsx");

    expect(homePage).toContain("getCoachGreeting");
    expect(homePage).toContain("remoteSummary?.serverTime ?? null");
    expect(homePage).toContain("remoteSummary?.insight ?? null");
    expect(homePage).toContain("headline={remoteInsight?.headline ?? undefined}");
    expect(homePage).toContain("remoteInsight?.content");
    expect(homePage).not.toContain("function createInsight(");
  });

  it("loads weekly reviews and achievements from the server without changing their page structure", () => {
    const weeklyPage = read("src/pages/weekly-review/index.tsx");
    expect(weeklyPage).not.toContain("生成 7 天里程碑分享卡");
    expect(weeklyPage).not.toContain("weekly-review__milestone-link");
    expect(weeklyPage).toContain("remoteReview?.recordedDays");
    expect(weeklyPage).toContain("remoteReview?.rhythm");
    const achievementsPage = read("src/pages/achievements/index.tsx");

    expect(weeklyPage).toContain("getProductWeeklyReview");
    expect(achievementsPage).toContain("refreshProductAchievements");
    expect(weeklyPage).not.toContain("基于当前设备中的记录生成");
    expect(achievementsPage).not.toContain("所有成就均根据当前设备中的记录计算");
  });

  it("uses the light summary variant for coach target synchronization", () => {
    const coachPage = read("src/pages/coach/index.tsx");

    expect(coachPage).toContain("getProductDailySummary(date, { light: true })");
  });
});
