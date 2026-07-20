import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("product data HTTPS boundary", () => {
  it("saves profile, onboarding body data, and goals through the product HTTPS client instead of Supabase", () => {
    for (const page of ["pages/profile-edit/index.tsx", "pages/body-profile/index.tsx", "pages/goal-adjust/index.tsx", "pages/nutrition-plan/index.tsx"]) {
      const source = readFileSync(resolve(sourceRoot, page), "utf8");
      expect(source).toContain("product-data-api");
      expect(source).not.toContain("getSupabaseClient");
      expect(source).not.toContain("selectRuntimeAdapter");
    }
    const plan = readFileSync(resolve(sourceRoot, "pages/nutrition-plan/index.tsx"), "utf8");
    expect(plan).toContain("completeProductOnboarding");
    expect(plan).not.toContain("completeSupabaseOnboarding");
  });
});
