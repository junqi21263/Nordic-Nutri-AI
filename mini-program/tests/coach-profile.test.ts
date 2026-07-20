import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createCoachAdvice, createAchievements } from "../src/features/coach/domain";
import { createAchievementStore } from "../src/stores/achievement-store";
import { createCoachStore } from "../src/stores/coach-store";
import { createMealFixtures } from "../src/features/meals/domain";
import { createProfileStore } from "../src/stores/profile-store";

const coachPageSource = () => readFileSync(resolve(import.meta.dirname, "../src/pages/coach/index.tsx"), "utf8");

describe("local coach and profile", () => {
  it("generates coach advice from local meals", () => {
    const advice = createCoachAdvice(createMealFixtures("2026-07-13"), "2026-07-13");
    expect(advice.length).toBeGreaterThan(0);
    expect(advice[0]?.message).toContain("蛋白");
  });
  it("supports favorite, dismiss and regenerate local advice", () => {
    const store = createCoachStore();
    store.getState().setAdvice(createCoachAdvice(createMealFixtures("2026-07-13"), "2026-07-13"));
    const id = store.getState().advice[0]!.id;
    store.getState().toggleFavorite(id);
    store.getState().dismiss(id);
    expect(store.getState().advice[0]?.favorite).toBe(true);
    expect(store.getState().advice[0]?.dismissed).toBe(true);
  });
  it("calculates at least twenty achievements and keeps local settings", () => {
    const achievements = createAchievements(createMealFixtures("2026-07-13"), "2026-07-13");
    expect(achievements.length).toBeGreaterThanOrEqual(20);
    const store = createAchievementStore();
    store.getState().setAchievements(achievements);
    expect(store.getState().achievements.length).toBeGreaterThanOrEqual(20);
    const profile = createProfileStore();
    profile.getState().setSetting("theme", "dark");
    expect(profile.getState().settings.theme).toBe("dark");
  });

  it("uses the requested coach title without the duplicate intro identity", () => {
    const source = coachPageSource();
    const titleStart = source.indexOf('className="coach-chat__page-title"');
    const titleEnd = source.indexOf('className="coach-chat__status"');

    expect(source).toContain('title="你的营养教练"');
    expect(source.slice(titleStart, titleEnd)).toContain("你的营养教练");
    expect(source.slice(titleStart, titleEnd)).not.toContain("NordicIcon");
    expect(source).not.toContain("coach-chat__avatar");
    expect(source).not.toContain("coach-chat__eyebrow");
  });

  it("keeps the Coach tab focused on a daily action and direct conversation", () => {
    const source = coachPageSource();

    expect(source).toContain("今日还差");
    expect(source).toContain("问问你的营养教练");
    expect(source).toContain('className="coach-chat__status"');
    expect(source).toContain('className="coach-chat__suggestion-product"');
    expect(source).toContain('const quickPrompts = ["晚餐怎么补蛋白？", "查看今日进度"]');
  });

  it("uses a coach-aligned personal-center header and synchronizes tab selection from profile metrics", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");

    expect(source).toContain('title="个人中心"');
    expect(source).toContain('className="page-layout--profile"');
    expect(source).toContain('className="profile-page-title"');
    expect(source).not.toContain('title="我的节奏"');
    expect(source).not.toContain('className="profile-rhythm__goal-progress"');
    expect(source).not.toContain("把目标、记录与改变放在同一张地图上。");
    expect(source).toContain("蛋白完成度");
    expect(source).toContain("本周回顾");
    expect(source).toContain('setActiveKey("coach")');
    expect(source).toContain('Taro.switchTab({ url: "/pages/coach/index" })');
    expect(source).toContain('setActiveKey("meal-records")');
    expect(source).toContain('Taro.switchTab({ url: "/pages/meal-records/index" })');
    expect(source).not.toContain('title="Theme"');
    expect(source).not.toContain('title="Language"');
  });

  it("routes the profile hub to complete local profile pages without legacy settings", () => {
    const appConfig = readFileSync(resolve(import.meta.dirname, "../src/app.config.ts"), "utf8");
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");

    ["profile-edit", "goal-adjust", "achievements", "weekly-review"].forEach((page) => {
      expect(appConfig).toContain(`pages/${page}/index`);
    });
    ["profile-edit", "achievements", "weekly-review"].forEach((page) => {
      expect(source).toContain(`/pages/${page}/index`);
    });
    expect(source).not.toContain("/pages/goal-adjust/index");
    expect(source).toContain('title="隐私与数据"');
    expect(source).toContain('title="反馈与帮助"');
    expect(source).toContain('title="关于我们"');
    expect(source).not.toContain('title="主题"');
    expect(source).not.toContain('title="语言"');
    expect(source).not.toContain('title="提醒"');
    expect(source).not.toContain("导出本地数据");
  });

  it("keeps privacy, feedback and about as complete local modals", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");

    expect(source).toContain('activeModal === "privacy"');
    expect(source).toContain("数据仅保留在当前设备");
    expect(source).toContain('activeModal === "feedback"');
    expect(source).toContain("提交反馈");
    expect(source).toContain('activeModal === "about"');
    expect(source).toContain("Nordic Nutri AI 是一款本地体验中的营养记录工具");
  });

  it("provides local profile and goal forms backed by the profile store", () => {
    const profileEdit = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"),
      "utf8",
    );
    const goalAdjust = readFileSync(
      resolve(import.meta.dirname, "../src/pages/goal-adjust/index.tsx"),
      "utf8",
    );

    expect(profileEdit).toContain("profile.setProfile");
    expect(profileEdit).toContain("保存资料");
    expect(profileEdit).toContain('className="page-layout--profile-edit"');
    expect(profileEdit).toContain('className="profile-subpage__page-title"');
    expect(profileEdit).toContain('className="profile-edit__notice"');
    expect(profileEdit).toContain('className="profile-edit__action"');
    expect(profileEdit).toContain("昵称会保存到你的账号");
    expect(profileEdit).not.toContain('eyebrow="我的节奏"');
    expect(profileEdit).not.toContain("保留最重要的信息，让目标更贴合现在的你。");
    expect(goalAdjust).toContain("profile.setProfile");
    expect(goalAdjust).toContain("保存目标");
  });

  it("uses coach-aligned headers for achievements and weekly review without the removed lead copy", () => {
    const achievements = readFileSync(
      resolve(import.meta.dirname, "../src/pages/achievements/index.tsx"),
      "utf8",
    );
    const weeklyReview = readFileSync(
      resolve(import.meta.dirname, "../src/pages/weekly-review/index.tsx"),
      "utf8",
    );

    expect(achievements).toContain("全部成就");
    expect(achievements).toContain("createAchievements");
    expect(achievements).toContain('className="page-layout--achievements"');
    expect(achievements).toContain('className="profile-subpage__page-title"');
    expect(achievements).not.toContain("继续记录，让每一餐都成为节奏。");
    expect(weeklyReview).toContain("本周回顾");
    expect(weeklyReview).toContain('className="page-layout--weekly-review"');
    expect(weeklyReview).toContain('className="profile-subpage__page-title"');
    expect(weeklyReview).not.toContain("看见已经做到的，再决定下一步。");
    expect(weeklyReview).toContain('className="weekly-review__rhythm"');
    expect(weeklyReview).toContain("本周节奏");
    expect(weeklyReview).toContain("下周小目标");
    expect(weeklyReview).toContain("基于当前设备中的记录");
  });
});
