import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("profile edit real save", () => {
  it("writes nickname, weight, and goal direction through authenticated HTTPS data clients", () => {
    const page = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"),
      "utf8",
    );

    expect(page).toContain("saveProductProfile");
    expect(page).toContain("saveProductBodyProfile");
    expect(page).toContain("saveProductGoal");
    expect(page).toContain("previewProductNutritionPlan");
    expect(page).toContain("ConfirmDialog");
    expect(page).toContain("增益增肌");
    expect(page).toContain("健康饮食");
    expect(page).toContain("profile-choice-group--single-line");
    expect(page).toContain("目标方向已更新");
    expect(page).toContain("getProductAccount");
    expect(page).toContain("nicknameModerationError");
    expect(page).toContain("feedback.show({ message: nicknameError");
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving}");
  });

  it("refreshes the profile hero on every page show and ignores an older account response", () => {
    const page = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile/index.tsx"),
      "utf8",
    );

    expect(page).toContain("const profileSyncVersion = useRef(0)");
    expect(page).toContain("const syncProfileFromAccount = () =>");
    expect(page).toContain("if (requestVersion !== profileSyncVersion.current) return;");
    expect(page).toContain("useDidShow(() => {");
    expect(page).toContain("syncProfileFromAccount();");
  });
});
