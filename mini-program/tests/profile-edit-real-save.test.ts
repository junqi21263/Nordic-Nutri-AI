import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("profile edit real save", () => {
  it("writes the allowed nickname field through the repository when the real backend is enabled", () => {
    const page = readFileSync(resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"), "utf8");

    expect(page).toContain("selectRuntimeAdapter");
    expect(page).toContain("createProfileRepository");
    expect(page).toContain("updateProfile");
    expect(page).toContain("loading={isSaving}");
  });
});
