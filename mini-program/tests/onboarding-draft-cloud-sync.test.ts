import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../", path), "utf8");

describe("onboarding cloud draft sync", () => {
  it("restores unfinished cloud drafts and clears local sync after completion", () => {
    expect(read("src/api/product-data-api.ts")).toContain('"/onboarding-draft"');
    expect(read("src/auth/app-auth-bootstrap.ts")).toContain("account.onboardingDraft");
    expect(read("src/pages/onboarding/index.tsx")).toContain("queueOnboardingDraftSync");
    expect(read("src/pages/body-profile/index.tsx")).toContain("queueOnboardingDraftSync");
    expect(read("src/pages/diet-preferences/index.tsx")).toContain("queueOnboardingDraftSync");
    const plan = read("src/pages/nutrition-plan/index.tsx");
    expect(plan).toContain("clearQueuedOnboardingDraftSync");
    expect(plan).toContain("useOnboardingDraftStore.getState().reset()");
  });
});
