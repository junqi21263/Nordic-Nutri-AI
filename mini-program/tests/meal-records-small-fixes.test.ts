import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = resolve(import.meta.dirname, "../src/pages/meal-records/index.tsx");
const stylePath = resolve(import.meta.dirname, "../src/styles/page.scss");

describe("meal records small fixes", () => {
  it("separates visible month navigation from the future-date selection limit", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("visibleMonthDate");
    expect(source).toContain("getMonthGrid(visibleMonthDate)");
    expect(source).toContain("shiftMonth(visibleMonthDate, offset)");
    expect(source).toContain("date <= maxDate");
  });

  it("does not clip the saved-meal ring into left and right halves", () => {
    const source = readFileSync(pagePath.replace("pages/meal-records/index.tsx", "components/meal-saved-celebration/index.tsx"), "utf8");
    const styles = readFileSync(stylePath, "utf8");
    expect(source).not.toContain("meal-saved-celebration__ring-mask");
    expect(styles).toContain("overflow: visible;");
    expect(styles).toContain(".meal-saved-celebration__success-ring");
  });
});
