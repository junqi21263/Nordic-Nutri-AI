import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(import.meta.dirname, "../src");

function read(relativePath: string) {
  return readFileSync(resolve(srcRoot, relativePath), "utf8");
}

describe("icon vocabulary variety", () => {
  it("keeps sparkles for brand marks and uses distinct icons elsewhere", () => {
    expect(read("components/app-top-bar/index.tsx")).toContain('name="sparkles"');
    expect(read("components/brand-header/index.tsx")).toContain('name="sparkles"');

    expect(read("components/ai-insight-card/index.tsx")).toContain('name="nova"');
    expect(read("pages/coach/index.tsx")).toContain('name="zap"');
    expect(read("pages/coach/index.tsx")).toContain('name="milestone"');
    expect(read("pages/food-scanner/index.tsx")).toContain('name="food-pot"');
    expect(read("pages/food-catalog/index.tsx")).toContain('name="search"');
    expect(read("pages/food-catalog/index.tsx")).toContain('icon: "utensils"');
    expect(read("pages/home/index.tsx")).toContain('name="camera"');
    expect(read("pages/achievements/index.tsx")).toContain("getAchievementIcon");
    expect(read("pages/profile/index.tsx")).toContain("getAchievementIcon");
    expect(read("features/coach/achievement-icons.ts")).toContain("蛋白达人");

    const tabBar = read("components/bottom-tab-bar/index.tsx");
    expect(tabBar).toContain('icon: "food-bowl"');
    expect(tabBar).toContain('icon: "bot"');
    expect(tabBar).not.toContain('icon: "utensils"');
  });
});
