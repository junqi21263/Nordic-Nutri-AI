import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../", path), "utf8");

describe("feedback reply flow", () => {
  it("keeps feedback controls aligned and presents an empty reply history", () => {
    expect(read("src/api/feedback-api.ts")).toContain("getMyFeedback");
    expect(read("src/api/feedback-api.ts")).toContain("markFeedbackRepliesRead");
    const page = read("src/pages/profile/index.tsx");
    expect(page).toContain("反馈处理");
    expect(page).toContain("Picker");
    expect(page).toContain('className="profile-feedback-title"');
    expect(page).toContain('className="profile-feedback-title__bell"');
    expect(page).toContain("我们的回复");
    expect(page).toContain('className="profile-feedback-empty"');
    expect(page).toContain("暂无反馈记录");
    expect(page).toContain("markFeedbackRepliesRead");
    expect(read("src/components/nordic-icon/index.tsx")).toContain('"bell"');
    const styles = read("src/styles/page.scss");
    expect(styles).toContain(".profile-feedback-mode-picker");
    expect(styles).toContain("justify-content: center");
    expect(styles).toContain(".profile-feedback-empty");
  });
});
