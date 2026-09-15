import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("meal records top action", () => {
  it("keeps the frequent meals entry compact and visually separated from the brand", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/meal-records/index.tsx"), "utf8");
    const topBar = readFileSync(resolve(sourceRoot, "components/app-top-bar/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "components/app-top-bar/index.scss"), "utf8");

    expect(page).toContain('topBarAction="我的常吃"');
    expect(page).toContain('url: "/pages/frequent-meals/index"');
    expect(topBar).toContain("rightAction ? 112 : 44");
    expect(styles).toContain("background: $color-soft-beige;");
    expect(styles).toContain("border-radius: $radius-full;");
    expect(styles).toContain("transition:");
    expect(styles).toContain("transform $duration-press $ease-standard");
  });
});
