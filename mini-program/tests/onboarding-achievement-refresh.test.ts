import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("refreshes achievements after onboarding completes", () => {
  const page = readFileSync(resolve(import.meta.dirname, "../src/pages/nutrition-plan/index.tsx"), "utf8");
  expect(page).toContain('import("../../features/coach/refresh-achievements")');
  expect(page).toContain("refreshProductAchievements()");
});
