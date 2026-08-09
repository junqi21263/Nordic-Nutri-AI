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

  it("renders the daily reminder as the single action-first Coach entry", () => {
    const page = read("src/pages/coach/index.tsx");

    expect(page).toContain("getProductCoachDailyBrief");
    expect(page).toContain("loadDailyBrief");
    expect(page).toContain("NOVA · 今日提醒");
    expect(page).toContain("dailyBrief.greeting");
    expect(page).toContain("createCoachMealContext");
    expect(page).toContain("heroContext.summary");
    expect(page).toContain("heroContext.suggestion");
    expect(page).not.toContain("dailyBrief.summary");
    expect(page).not.toContain("dailyBrief.suggestion");
    expect(page).toContain("heroContext.ctaLabel");
    expect(page).toContain("heroContext.ctaAction");
    expect(page).toContain("今日进度");
    expect(page).toContain("蛋白质");
    expect(page).toContain("热量");
    expect(page).not.toContain("dailyBrief.reason");
    expect(page).not.toContain("dailyBrief.action");
    expect(page).not.toContain("coach-chat__status-badge");
    expect(page).toContain("NOVA 小贴士");
    expect(page).toContain("换一个建议");
    expect(page).toContain("推荐原因：");
    expect(page).toContain("新对话");
    expect(page).toContain("我今天吃什么？");
    expect(page).toContain("我的蛋白够吗？");
    expect(page).toContain("下一餐怎么搭配？");
    expect(page).not.toContain("重启对话");
  });

  it("keeps the daily action on one line and hides all progress details when collapsed", () => {
    const page = read("src/pages/coach/index.tsx");
    const styles = read("src/styles/page.scss");
    const heroSuggestion = styles.slice(
      styles.indexOf(".coach-chat__hero-suggestion"),
      styles.indexOf(".coach-chat__hero-cta"),
    );

    expect(heroSuggestion).toContain("white-space: nowrap");
    expect(heroSuggestion).toContain("text-overflow: ellipsis");
    expect(page).toContain('className="coach-chat__progress-details"');
    expect(page).toContain("{expandedSections.progress ? (");
  });
});
