import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(import.meta.dirname, "../src");

describe("achievement unlock overlay", () => {
  it("mounts the queued celebration overlay in the active page layout", () => {
    const overlay = readFileSync(resolve(srcRoot, "components/achievement-unlock-overlay/index.tsx"), "utf8");
    const app = readFileSync(resolve(srcRoot, "app.tsx"), "utf8");
    const pageLayout = readFileSync(resolve(srcRoot, "layouts/page-layout/index.tsx"), "utf8");
    const pageStyles = readFileSync(resolve(srcRoot, "styles/page.scss"), "utf8");

    expect(pageLayout).toContain("achievementUnlocked");
    expect(overlay).toContain("achievement-unlock-overlay");
    expect(overlay).toContain("achievement-unlock-overlay__card");
    expect(overlay).toContain("achievement-unlock-overlay__particle");
    expect(overlay).toContain("achievement-unlock-overlay__confetti");
    expect(overlay).not.toContain("成长里程");
    expect(pageLayout).toContain("acknowledgeProductAchievementCelebration");
    expect(overlay).not.toContain("useAchievementStore");
    expect(overlay).toContain("成就已解锁");
    expect(overlay).toContain("收下这份成就");
    expect(overlay).toContain("查看全部成就");
    expect(overlay).toContain('Taro.navigateTo({ url: "/pages/achievements/index" })');
    expect(pageLayout).toContain("AchievementUnlockOverlay");
    expect(pageLayout).toContain("<AchievementUnlockOverlay");
    expect(pageLayout).toContain("useAchievementStore((state) => state.achievementUnlocked)");
    expect(pageLayout).toContain("activeAchievement");
    expect(app).not.toContain("AchievementUnlockOverlay");
    expect(pageStyles).toContain(".achievement-unlock-overlay__confetti");
    expect(pageStyles).toContain("animation: achievement-unlock-particle 2800ms");
  });
});
