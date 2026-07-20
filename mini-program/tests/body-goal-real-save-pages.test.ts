import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(import.meta.dirname, `../src/pages/${path}/index.tsx`), "utf8");

describe("body and goal real save pages", () => {
  it("persists a validated body profile version before continuing when the development backend is enabled", () => {
    const page = source("body-profile");

    expect(page).toContain("createBodyProfileRepository");
    expect(page).toContain("selectRuntimeAdapter");
    expect(page).toContain("saveVersion");
    expect(page).toContain("loading={isSaving}");
  });

  it("persists a goal version through the repository before returning to the profile page", () => {
    const page = source("goal-adjust");

    expect(page).toContain("createHealthGoalRepository");
    expect(page).toContain("selectRuntimeAdapter");
    expect(page).toContain("saveVersion");
    expect(page).toContain("loading={isSaving}");
  });

  it("persists the complete onboarding transaction before opening the home page", () => {
    const page = source("nutrition-plan");

    expect(page).toContain("completeCloudbaseOnboarding");
    expect(page).toContain("loading={isSaving}");
  });
});
