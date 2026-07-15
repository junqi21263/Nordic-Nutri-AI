import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultLocale, getLocaleMessages } from "../src/locales";
import { getOnboardingNavigationMetrics } from "../src/utils/onboarding-navigation";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = (relativePath: string) => resolve(projectRoot, relativePath);
const readSource = (relativePath: string) => readFileSync(sourcePath(relativePath), "utf8");

describe("Onboarding localization and WeChat layout contract", () => {
  it("defaults copy to the supplied Simplified Chinese content", () => {
    const messages = getLocaleMessages(defaultLocale);
    expect(defaultLocale).toBe("zh-CN");
    expect(messages.onboarding.title).toBe("你的目标是什么？");
    expect(messages.onboarding.goals.muscle_gain.title).toBe("增肌");
    expect(messages.onboarding.continue).toBe("继续");
  });

  it("reserves header space from the actual menu-button rectangle", () => {
    const metrics = getOnboardingNavigationMetrics({
      statusBarHeight: 24,
      windowWidth: 375,
      menuButtonRect: { left: 288, top: 30, right: 359, bottom: 62, height: 32, width: 71 },
    });
    expect(metrics.statusBarHeight).toBe(24);
    expect(metrics.navigationBarHeight).toBe(44);
    expect(metrics.totalHeaderHeight).toBe(68);
    expect(metrics.titleMaxWidth).toBe(184);
    expect(metrics.headerHeight).toBe(68);
    expect(metrics.rightInset).toBe(95);
  });

  it("provides zh-CN as the default local locale with typed future locale slots", () => {
    expect(existsSync(sourcePath("src/locales/index.ts"))).toBe(true);
    expect(existsSync(sourcePath("src/locales/zh-CN.ts"))).toBe(true);
    expect(existsSync(sourcePath("src/locales/zh-TW.ts"))).toBe(true);
    expect(existsSync(sourcePath("src/locales/en-US.ts"))).toBe(true);
  });

  it("keeps Onboarding copy out of JSX and renders local SVG goal icons", () => {
    const source = readSource("src/pages/onboarding/index.tsx");
    expect(source).toContain("onboardingCopy");
    expect(source).toContain("NordicIcon");
    expect(source).toContain('"goal-muscle"');
    expect(source).toContain('"goal-fat-loss"');
    expect(source).toContain('"goal-maintenance"');
    expect(source).toContain('"goal-performance"');
    expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(source).not.toContain("What is your goal?");
  });

  it("uses the menu-button rect instead of a fixed top navigation height", () => {
    const source = readSource("src/pages/onboarding/index.tsx");
    const header = readSource("src/components/onboarding-header/index.tsx");
    const navbar = readSource("src/components/app-navbar/index.tsx");
    const metricsHook = readSource("src/utils/use-menu-button-metrics.ts");
    expect(source).toContain("OnboardingHeader");
    expect(header).toContain("AppNavbar");
    expect(navbar).toContain("useMenuButtonMetrics");
    expect(navbar).toContain("totalHeaderHeight");
    expect(navbar).toContain("titleMaxWidth");
    expect(navbar).toContain('left: "50%"');
    expect(navbar).toContain("translateX(-50%)");
    expect(navbar).toContain('pointerEvents: "none"');
    expect(navbar).toContain("zIndex: 1");
    expect(metricsHook).toContain("getMenuButtonBoundingClientRect");
    expect(existsSync(sourcePath("src/utils/onboarding-navigation.ts"))).toBe(true);
  });

  it("uses compact Stitch-calibrated Onboarding dimensions", () => {
    const styles = readSource("src/styles/page.scss");
    expect(styles).toContain("$onboarding-page-gutter");
    expect(styles).toContain("$onboarding-card-height");
    expect(styles).toContain("$onboarding-button-height");
    expect(styles).toContain("font-weight: 600;");
  });

  it("keeps the onboarding continue action aligned to the page gutters", () => {
    const styles = readSource("src/styles/page.scss");
    const start = styles.indexOf(".onboarding-page .bottom-action-layout .app-button");
    expect(start).toBeGreaterThan(-1);
    expect(styles.slice(start, start + 400)).toContain("width: 100%;");
  });
});
