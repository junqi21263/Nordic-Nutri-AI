import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAchievementUnlockedAt,
  getAchievementNextAction,
  getAchievementRequirement,
  sortAchievementsForProfilePreview,
} from "../src/features/coach/achievement-catalog";

const srcRoot = resolve(import.meta.dirname, "../src");

describe("achievement detail interactions", () => {
  it("formats unlock time and requirement copy", () => {
    expect(formatAchievementUnlockedAt("2026-07-18T08:00:00.000Z")).toContain("2026-07-18");
    expect(formatAchievementUnlockedAt("2026-07-20T12:00:00+08:00")).toBe("2026-07-20 达成");
    expect(formatAchievementUnlockedAt(null)).toContain("云端记录");
    expect(getAchievementRequirement("蛋白达人")).toContain("90%");
    expect(getAchievementNextAction("第一餐记录", 0)).toBe("去记录第一餐");
    expect(getAchievementNextAction("早餐节奏", 0)).toBe("去记录早餐");
    expect(getAchievementNextAction("午餐专注", 0)).toBe("去记录午餐");
    expect(getAchievementNextAction("晚餐平衡", 0)).toBe("去记录晚餐");
  });

  it("uses the shared bottom-sheet detail instead of a separate route", () => {
    const page = readFileSync(resolve(srcRoot, "pages/achievements/index.tsx"), "utf8");
    const detailSheet = readFileSync(resolve(srcRoot, "components/achievement-detail-sheet/index.tsx"), "utf8");
    const catalog = readFileSync(resolve(srcRoot, "features/coach/achievement-catalog.ts"), "utf8");
    expect(page).toContain("AchievementDetailSheet");
    expect(detailSheet).toContain("BottomSheet");
    expect(detailSheet).toContain("unlockedAt");
    expect(detailSheet).toContain("解锁目标");
    expect(detailSheet).toContain("当前进度");
    expect(detailSheet).toContain("getAchievementNextAction");
    expect(catalog).toContain("去记录第一餐");
    expect(catalog).toContain("去记录早餐");
    expect(catalog).toContain("去记录下一餐");
    expect(detailSheet).toContain('Taro.switchTab({ url: "/pages/meal-records/index" })');
    expect(page).toContain("达成时间");
    expect(page).toContain("achievement-center__filters");
  });

  it("puts the latest unlocked achievements before locked achievements in the profile preview", () => {
    const result = sortAchievementsForProfilePreview([
      { id: "locked", title: "早餐节奏", unlocked: false, progress: 33 },
      { id: "older", title: "第一餐记录", unlocked: true, progress: 100, unlockedAt: "2026-08-01T09:00:00+08:00" },
      { id: "latest", title: "蛋白达人", unlocked: true, progress: 100, unlockedAt: "2026-08-04T09:00:00+08:00" },
    ]);

    expect(result.map((achievement) => achievement.id)).toEqual(["latest", "older", "locked"]);
  });

  it("opens the same achievement detail sheet from the profile preview for locked and unlocked achievements", () => {
    const page = readFileSync(resolve(srcRoot, "pages/profile/index.tsx"), "utf8");
    expect(page).toContain("AchievementDetailSheet");
    expect(page).toContain("onClick={() => setSelectedAchievement(achievement)}");
  });
});
