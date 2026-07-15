import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const source = (relativePath: string) => resolve(root, relativePath);
const read = (relativePath: string) => readFileSync(source(relativePath), "utf8");

describe("global UI calibration contract", () => {
  it("provides a shared capsule-safe navbar and renderable local SVG icon system", () => {
    const navbarPath = "src/components/app-navbar/index.tsx";
    const iconPath = "src/components/nordic-icon/index.tsx";
    expect(existsSync(source(navbarPath))).toBe(true);
    expect(existsSync(source(iconPath))).toBe(true);

    const navbar = read(navbarPath);
    expect(navbar).toContain("useMenuButtonMetrics");
    expect(navbar).toContain("totalHeaderHeight");
    expect(navbar).toContain("titleMaxWidth");
    expect(navbar).toContain("backAriaLabel");
    expect(navbar).toContain("onBack");

    const icon = read(iconPath);
    expect(icon).toContain('import { Image } from "@tarojs/components"');
    expect(icon).toContain("iconSources");
    expect(icon).toContain('height: `${size}px`');
    expect(icon).toContain('width: `${size}px`');

    for (const name of ["back", "check", "goal-muscle", "activity-low", "nova", "flame", "protein", "carbs", "fat", "milestone"]) {
      expect(icon).toContain(name);
      const assetPath = `src/assets/icons/${name}.svg`;
      expect(existsSync(source(assetPath))).toBe(true);
      expect(read(assetPath)).toContain('stroke-width="1.8"');
    }
  });

  it("uses consistent Lucide SVGs for the four onboarding goal choices", () => {
    const expectedIcons = {
      "goal-muscle": "biceps-flexed",
      "goal-fat-loss": "flame",
      "goal-maintenance": "scale",
      "goal-performance": "trophy",
    };

    for (const [name, lucideName] of Object.entries(expectedIcons)) {
      const svg = read(`src/assets/icons/${name}.svg`);
      expect(svg).toContain(`data-lucide="${lucideName}"`);
      expect(svg).toContain('stroke="#153F2B"');
      expect(svg).toContain('stroke-width="1.8"');
    }
  });

  it("keeps the onboarding header as an AppNavbar compatibility wrapper", () => {
    const header = read("src/components/onboarding-header/index.tsx");
    expect(header).toContain("AppNavbar");
    expect(header).toContain("brand");
    expect(header).toContain("step");
    expect(header).toContain("progressAriaLabel");
  });

  it("exposes the full semantic Stitch token set", () => {
    const tokens = read("src/styles/tokens.scss");
    const pageStyles = read("src/styles/page.scss");
    const actionLayout = read("src/components/bottom-action-layout/index.tsx");
    // Taro compiles source px to rpx: these source values render as the
    // 20px/54px/16px Stitch values on the 375px WeChat design frame.
    expect(tokens).toContain("$stitch-page-gutter: 40px;");
    expect(tokens).toContain("$stitch-action-height: 108px;");
    expect(tokens).toContain("$stitch-card-radius: 32px;");
    expect(pageStyles).toContain("env(safe-area-inset-bottom)");
    expect(pageStyles).toContain(".onboarding-page");
    expect(pageStyles).toContain(".body-profile-page");
    expect(pageStyles).toContain(".nutrition-plan-page");
    expect(actionLayout).toContain("stacked");
    expect(actionLayout).toContain("bottom-action-layout--stacked");
    for (const token of [
      "$color-text-tertiary",
      "$color-disabled-bg",
      "$color-overlay",
      "$font-brand",
      "$font-page-title",
      "$font-section-title",
      "$font-card-title",
      "$font-button",
      "$font-number-large",
      "$space-28",
      "$page-horizontal",
      "$section-gap",
      "$card-gap",
      "$card-padding",
      "$safe-bottom-spacing",
      "$radius-card",
      "$radius-button",
      "$shadow-none",
      "$shadow-subtle",
      "$shadow-overlay",
      "$duration-normal",
      "$reduced-motion-duration",
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it("uses shared safe-area, header and bottom-action components", () => {
    for (const component of [
      "app-safe-area",
      "app-header",
      "onboarding-header",
      "bottom-action-layout",
    ]) {
      expect(existsSync(source(`src/components/${component}/index.tsx`))).toBe(true);
    }
    expect(read("src/layouts/page-layout/index.tsx")).toContain("AppSafeArea");
    expect(read("src/components/top-navigation/index.tsx")).toContain("AppHeader");
    expect(read("src/pages/onboarding/index.tsx")).toContain("OnboardingHeader");
    expect(read("src/pages/onboarding/index.tsx")).toContain("BottomActionLayout");
  });

  it("keeps the fixed bottom navigation opaque above scrolling page content", () => {
    const components = read("src/styles/components.scss");
    const tabBarStart = components.indexOf(".bottom-tab-bar {");
    const tabBarStyles = components.slice(tabBarStart, tabBarStart + 420);

    expect(tabBarStyles).toContain("background: $color-surface;");
  });

  it("keeps visual pages free of direct hexadecimal colours", () => {
    for (const page of [
      "onboarding",
      "body-profile",
      "nutrition-plan",
      "home",
      "food-scanner",
      "analysis-result",
      "portion-adjustment",
      "meal-records",
      "meal-detail",
      "coach",
      "profile",
    ]) {
      expect(read(`src/pages/${page}/index.tsx`)).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });
});
