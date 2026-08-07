import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../", path), "utf8");

describe("feedback reply flow", () => {
  it("opens replied feedback in the processing tab and uses in-app tabs", () => {
    expect(read("src/api/feedback-api.ts")).toContain("getMyFeedback");
    expect(read("src/api/feedback-api.ts")).toContain("markFeedbackRepliesRead");
    const page = read("src/pages/profile/index.tsx");
    expect(page).toContain("反馈处理");
    expect(page).not.toContain("Picker");
    expect(page).toContain('hasFeedbackReply ? "history" : "submit"');
    expect(page).toContain("useDidShow(() =>");
    expect(page).toContain('className="profile-feedback-title"');
    expect(page).toContain('className="profile-feedback-title__bell"');
    expect(page).toContain('className="profile-feedback-title__arrow"');
    expect(page).toContain("我们的回复");
    expect(page).toContain('className="profile-feedback-empty"');
    expect(page).toContain("暂无反馈记录");
    expect(page).toContain("markFeedbackRepliesRead");
    expect(read("src/components/nordic-icon/index.tsx")).toContain('"bell"');
    const styles = read("src/styles/page.scss");
    expect(styles).toContain(".profile-feedback-tabs");
    expect(styles).toContain(".profile-feedback-tab--active");
    expect(styles).toContain(".profile-feedback-empty");
  });
});
