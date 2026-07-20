import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(import.meta.dirname, `../src/pages/${path}/index.tsx`), "utf8");

describe("body and goal real save pages", () => {
  it("persists a validated body profile version through the authenticated HTTPS data client", () => {
    const page = source("body-profile");

    expect(page).toContain("saveProductBodyProfile");
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving}");
    expect(page).toContain('setField("nickname"');
  });

  it("persists a goal version through the authenticated HTTPS data client before returning to the profile page", () => {
    const page = source("goal-adjust");

    expect(page).toContain("saveProductGoal");
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving}");
  });

  it("persists the complete onboarding transaction through the authenticated HTTPS service before opening the home page", () => {
    const page = source("nutrition-plan");

    expect(page).toContain("completeProductOnboarding");
    expect(page).toContain("nickname: profile.nickname");
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving}");
  });
});
