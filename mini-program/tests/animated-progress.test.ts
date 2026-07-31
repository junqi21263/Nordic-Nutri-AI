import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const srcRoot = resolve(import.meta.dirname, "../src");
const read = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), "utf8");

describe("progress bar animations", () => {
  it("exposes shared progress animation helpers", () => {
    const hook = read("hooks/useAnimatedProgress.ts");
    expect(hook).toContain("export function useAnimatedProgress");
    expect(hook).toContain("export function useDeferredProgress");
    expect(hook).toContain("(1 - t) ** 4");
    expect(hook).toContain("requestAnimationFrame");
  });

  it("wires animated fills into shared progress components", () => {
    expect(read("components/macro-progress/index.tsx")).toContain("AnimatedProgressBar");
    expect(read("components/circular-progress/index.tsx")).toContain("useAnimatedProgress");
    expect(read("components/daily-nutrition-summary/index.tsx")).toContain("useAnimatedProgress");
    expect(read("components/daily-nutrition-summary/index.tsx")).toContain("AnimatedProgressBar");
    expect(read("components/animated-progress-bar/index.tsx")).toContain("scaleX");
  });

  it("animates page-level progress tracks with GPU transform and respects reduced motion", () => {
    expect(read("pages/meal-records/index.tsx")).toContain("AnimatedProgressBar");
    expect(read("pages/coach/index.tsx")).toContain("AnimatedProgressBar");
    expect(read("components/app-navbar/index.tsx")).toContain("useDeferredProgress");

    const components = read("styles/components.scss");
    const tokens = read("styles/tokens.scss");
    expect(tokens).toContain("$duration-progress");
    expect(tokens).toContain("$ease-progress");
    expect(components).toContain("transform: scaleX(0)");
    expect(components).toContain("transition: transform $duration-progress $ease-progress");
    expect(components).toContain('[data-reduced-motion="true"] .animated-progress-bar');
  });
});
