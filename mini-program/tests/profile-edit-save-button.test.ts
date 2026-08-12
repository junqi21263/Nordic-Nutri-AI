import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("profile edit save action", () => {
  it("keeps the save action visible while its success uses the feedback modal", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"), "utf8");
    expect(source).toContain("disablePageEnterAnimation");
    expect(source).toContain('className="profile-edit__action"');
    expect(source).toContain("保存资料");
    expect(source).toContain('variant: "success"');
  });

  it("does not block the save-success modal on the optional achievement refresh", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"), "utf8");
    const modalIndex = source.indexOf("feedback.showModal({");
    const refreshIndex = source.indexOf("void refreshAchievementsInBackground()");

    expect(modalIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(modalIndex);
  });
});
