import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(import.meta.dirname, "../src");

describe("achievement unlock overlay", () => {
  it("renders a global queued celebration overlay with the two follow-up actions", () => {
    const overlay = readFileSync(resolve(srcRoot, "components/achievement-unlock-overlay/index.tsx"), "utf8");
    const app = readFileSync(resolve(srcRoot, "app.tsx"), "utf8");

    expect(overlay).toContain("achievementUnlocked");
    expect(overlay).toContain("achievement-unlock-overlay");
    expect(overlay).toContain("achievement-unlock-overlay__card");
    expect(overlay).toContain("achievement-unlock-overlay__particle");
    expect(overlay).toContain("acknowledgeProductAchievementCelebration");
    expect(overlay).toContain("markAchievementCelebrated");
    expect(overlay).toContain("成就已解锁");
    expect(overlay).toContain("继续记录");
    expect(overlay).toContain("查看成长里程");
    expect(overlay).toContain('Taro.navigateTo({ url: "/pages/achievements/index" })');
    expect(app).toContain("AchievementUnlockOverlay");
  });
});
