import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("NOVA proactive daily reminder", () => {
  it("loads the authenticated daily brief contract from the coach API", () => {
    const api = read("src/api/coach-api.ts");

    expect(api).toContain("ProductCoachDailyBrief");
    expect(api).toContain("getProductCoachDailyBrief");
    expect(api).toContain("/coach/daily-brief");
    expect(api).toContain("greeting: string");
    expect(api).toContain("suggestion: string");
    expect(api).toContain("theme: \"starter\"");
  });

  it("renders a compact three-paragraph NOVA reminder above chat without replacing the daily tip", () => {
    const page = read("src/pages/coach/index.tsx");

    expect(page).toContain("getProductCoachDailyBrief");
    expect(page).toContain("loadDailyBrief");
    expect(page).toContain("NOVA · 今日提醒");
    expect(page).toContain("dailyBrief.greeting");
    expect(page).toContain("dailyBrief.summary");
    expect(page).toContain("dailyBrief.suggestion");
    expect(page).not.toContain("dailyBrief.reason");
    expect(page).not.toContain("dailyBrief.action");
    expect(page).not.toContain("coach-chat__status-badge");
    expect(page).toContain("今日营养建议");
    expect(page).toContain("换一个建议");
    expect(page).toContain("推荐原因：");
    expect(page).toContain("今日任务");
  });
});
