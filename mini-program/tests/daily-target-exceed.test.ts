import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(import.meta.dirname, "../src");
const read = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), "utf8");

describe("daily target exceed presentation", () => {
  it("surfaces overflow copy and alert styles on home, records, and coach", () => {
    const summary = read("components/daily-nutrition-summary/index.tsx");
    const records = read("pages/meal-records/index.tsx");
    const coach = read("pages/coach/index.tsx");
    const domain = read("features/meals/domain.ts");
    const pageStyles = read("styles/page.scss");
    const componentStyles = read("styles/components.scss");

    expect(domain).toContain("export function formatTargetStatus");
    expect(domain).toContain("excess: Math.max(0, -remaining)");
    expect(summary).toContain("daily-summary__dashboard-ring--exceeded");
    expect(summary).toContain('calorieProgress.exceeded ? "已超" : "剩余"');
    expect(summary).toContain("formatTargetStatus");
    expect(records).toContain("meal-records-page__summary-status--exceeded");
    expect(records).toContain("formatTargetStatus(calorieProgress");
    expect(coach).toContain("coach-chat__progress-track--exceeded");
    expect(coach).toContain("formatTargetStatus");
    expect(pageStyles).toContain(".daily-summary__dashboard-ring--exceeded");
    expect(pageStyles).toContain(".meal-records-page__summary-track--exceeded");
    expect(componentStyles).toContain(".macro-progress--exceeded");
  });
});
