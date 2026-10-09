import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../src", path), "utf8");

describe("Android onboarding polish contracts", () => {
  it("limits icon alignment to the Android plan animation", () => {
    expect(read("components/nordic-icon/index.tsx")).not.toContain('textAlign: "left"');
    expect(read("components/plan-transition-overlay/index.scss")).toMatch(/\.plan-transition-overlay\.plan-transition-overlay--android\s*\{[\s\S]*?\.nordic-icon\s*\{\s*text-align: left;/);
  });
  it("uses compact Android plan actions without changing other routes", () => {
    expect(read("pages/nutrition-plan/index.tsx")).toContain("nutrition-plan-page--android");
    expect(read("styles/page.scss")).toMatch(/nutrition-plan-page--android \.bottom-action-layout\s*\{[^}]*gap: 10PX/);
    expect(read("styles/page.scss")).toMatch(/nutrition-plan-page--android \.bottom-action-layout \.app-button\s*\{[^}]*min-height: 44PX/);
  });
  it("centers success below the compact hero", () => {
    expect(read("pages/android-auth/index.scss")).toContain("min-height: calc(100dvh - 152PX)");
  });
  it("overrides default component button color with variant and disabled colors", () => {
    const css = read("styles/components.scss");
    expect(css).toContain(".app-button.app-button--primary");
    expect(css).toContain(".app-button.app-button--outline");
    expect(css).toContain(".app-button.app-button--disabled");
  });
  it("uses equal-width avoidance rows and trailing dietary icons", () => {
    expect(read("styles/page.scss")).toMatch(/__tag-list\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(read("pages/diet-preferences/index.tsx")).toContain("name={option.icon}");
  });
  it("uses a looping Android indicator instead of the WeChat Canvas", () => {
    expect(read("components/plan-transition-overlay/index.tsx")).toContain("plan-transition-overlay__android-spinner");
    expect(read("components/plan-transition-overlay/index.scss")).toContain("plan-android-spin 1.2s linear infinite");
  });
  it("renders the overlay outside the animated page scroll container", () => {
    expect(read("pages/diet-preferences/index.tsx")).toMatch(/overlay=\{\s*<PlanTransitionOverlay/);
  });
});
