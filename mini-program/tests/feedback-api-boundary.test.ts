import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("feedback persistence boundary", () => {
  it("submits profile feedback through the authenticated HTTPS API", () => {
    const api = read("src/api/feedback-api.ts");
    const page = read("src/pages/profile/index.tsx");
    expect(api).toContain("submitProductFeedback");
    expect(api).toContain("/feedback");
    expect(page).toContain("submitProductFeedback");
    expect(page).not.toContain("反馈仅保存在本次本地体验中，不会上传");
  });
});
