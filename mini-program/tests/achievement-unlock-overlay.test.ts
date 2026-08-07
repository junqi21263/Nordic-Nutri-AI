import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(import.meta.dirname, "../src");

describe("achievement unlock overlay", () => {
  it("mounts the queued celebration overlay in the active page layout", () => {
    const overlay = readFileSync(resolve(srcRoot, "components/achievement-unlock-overlay/index.tsx"), "utf8");
    const modal = readFileSync(resolve(srcRoot, "components/achievement-unlock-modal/index.tsx"), "utf8");
    const confetti = readFileSync(resolve(srcRoot, "components/achievement-confetti-canvas/index.tsx"), "utf8");
    const app = readFileSync(resolve(srcRoot, "app.tsx"), "utf8");
    const pageLayout = readFileSync(resolve(srcRoot, "layouts/page-layout/index.tsx"), "utf8");
    const pageStyles = readFileSync(resolve(srcRoot, "styles/page.scss"), "utf8");

    expect(pageLayout).toContain("achievementUnlocked");
    expect(modal).toContain("export interface AchievementUnlockModalProps");
    expect(modal).toContain("export function AchievementUnlockModal");
    expect(overlay).toContain("AchievementUnlockModal");
    expect(modal).toContain("achievement-unlock-overlay");
    expect(modal).toContain("achievement-unlock-overlay__card");
    expect(modal).toContain("achievement-unlock-overlay__sparkle");
    expect(modal).toContain('size={32}');
    expect(modal).toContain('name="x"');
    expect(modal).toContain("AchievementConfettiCanvas");
    expect(modal).not.toContain("renderParticles");
    expect(modal).not.toContain("成长里程");
    expect(pageLayout).toContain("acknowledgeProductAchievementCelebration");
    expect(modal).not.toContain("useAchievementStore");
    expect(modal).toContain("🎉 已解锁成就");
    expect(modal).toContain("成功记录第一餐，开启你的营养记录旅程。");
    expect(modal).toContain("继续记录");
    expect(modal).toContain("查看成就");
    expect(modal).toContain("achievement-unlock-overlay__progress");
    expect(modal).toContain('Taro.navigateTo({ url: "/pages/achievements/index" })');
    expect(pageLayout).toContain("AchievementUnlockModal");
    expect(pageLayout).toContain("<AchievementUnlockModal");
    expect(pageLayout).toContain("useAchievementStore((state) => state.achievementUnlocked)");
    expect(pageLayout).toContain("activeAchievement");
    expect(pageLayout).toContain("useDidHide");
    expect(pageLayout).toContain("pageVisible");
    expect(pageLayout).toContain("{pageVisible ?");
    expect(app).not.toContain("AchievementUnlockOverlay");
    expect(pageStyles).toContain("backdrop-filter: blur(12px)");
    expect(modal).toContain("useDeferredProgress(5, 1500)");
    expect(pageStyles).toContain("animation: achievement-unlock-card-in 600ms cubic-bezier(0.175, 0.885, 0.32, 1.275) 500ms both");
    expect(pageStyles).toContain("achievement-unlock-backdrop-in 300ms ease-out");
    expect(pageStyles).toContain("translateY(20px) scale(0.9)");
    expect(pageStyles).toContain("achievement-unlock-icon-glow 2s ease-in-out");
    expect(pageStyles).not.toContain("#d8a94b");
    expect(confetti).toContain("const particleCountPerSide = 40");
    expect(confetti).toContain('const colors = ["#0B3B24", "#bdeecc", "#e3e3de", "#F9F8F3"]');
    expect(confetti).toContain("const gravity = 0.5");
    expect(confetti).toContain("const drag = 0.95");
    expect(confetti).toContain("const confettiDelayMs = 300");
    expect(confetti).toContain("requestAnimationFrame");
    expect(confetti).toContain('const startX = side === "left" ? -20 : width + 20');
  });
});
