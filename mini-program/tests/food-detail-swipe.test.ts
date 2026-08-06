import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveHorizontalSwipe, siblingIndex } from "../src/features/food-catalog/detail-swipe";

describe("food detail swipe", () => {
  it("resolves horizontal swipe and ignores vertical scroll", () => {
    expect(resolveHorizontalSwipe(-80, 10)).toBe(1);
    expect(resolveHorizontalSwipe(80, 10)).toBe(-1);
    expect(resolveHorizontalSwipe(-80, 90)).toBe(0);
    expect(resolveHorizontalSwipe(-20, 0)).toBe(0);
  });

  it("bounds sibling index at the ends", () => {
    expect(siblingIndex(0, -1, 3)).toBeNull();
    expect(siblingIndex(0, 1, 3)).toBe(1);
    expect(siblingIndex(2, 1, 3)).toBeNull();
    expect(siblingIndex(1, -1, 1)).toBeNull();
  });

  it("wires catalog queue into food detail swipe handlers", () => {
    const catalog = readFileSync(
      resolve(import.meta.dirname, "../src/pages/food-catalog/index.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      resolve(import.meta.dirname, "../src/pages/food-detail/index.tsx"),
      "utf8",
    );
    const store = readFileSync(
      resolve(import.meta.dirname, "../src/stores/food-selection-store.ts"),
      "utf8",
    );
    expect(catalog).toContain("inspectFood(food, items)");
    expect(store).toContain("detailQueue");
    expect(detail).toContain("onTouchStart");
    expect(detail).toContain("onTouchEnd");
    expect(detail).toContain("resolveHorizontalSwipe");
    expect(detail).toContain("food-detail-page__nav");
    expect(detail).not.toContain("左右滑动切换");
  });
});
