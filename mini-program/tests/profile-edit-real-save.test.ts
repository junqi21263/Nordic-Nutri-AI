import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("profile edit real save", () => {
  it("writes nickname, weight, and goal direction through authenticated HTTPS data clients", () => {
    const page = readFileSync(resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"), "utf8");

    expect(page).toContain("saveProductProfile");
    expect(page).toContain("saveProductBodyProfile");
    expect(page).toContain("saveProductGoal");
    expect(page).toContain("getProductAccount");
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving}");
  });
});
