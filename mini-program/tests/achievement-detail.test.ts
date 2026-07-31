import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAchievementUnlockedAt,
  getAchievementRequirement,
} from "../src/features/coach/achievement-catalog";

const srcRoot = resolve(import.meta.dirname, "../src");

describe("achievement detail interactions", () => {
  it("formats unlock time and requirement copy", () => {
    expect(formatAchievementUnlockedAt("2026-07-18T08:00:00.000Z")).toContain("2026-07-18");
    expect(formatAchievementUnlockedAt("2026-07-20T12:00:00+08:00")).toBe("2026-07-20 达成");
    expect(formatAchievementUnlockedAt(null)).toContain("云端记录");
    expect(getAchievementRequirement("蛋白达人")).toContain("90%");
  });

  it("uses a bottom sheet detail instead of a separate route", () => {
    const page = readFileSync(resolve(srcRoot, "pages/achievements/index.tsx"), "utf8");
    expect(page).toContain("BottomSheet");
    expect(page).toContain("unlockedAt");
    expect(page).toContain("解锁目标");
    expect(page).toContain("达成时间");
    expect(page).toContain("achievement-center__filters");
  });
});
