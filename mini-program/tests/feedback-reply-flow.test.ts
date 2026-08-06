import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../", path), "utf8");

describe("feedback reply flow", () => {
  it("exposes reply history APIs and the profile unread reminder", () => {
    expect(read("src/api/feedback-api.ts")).toContain("getMyFeedback");
    expect(read("src/api/feedback-api.ts")).toContain("markFeedbackRepliesRead");
    const page = read("src/pages/profile/index.tsx");
    expect(page).toContain("反馈处理");
    expect(page).toContain("Picker");
    expect(page).toContain('name="bell"');
    expect(page).toContain("我们的回复");
    expect(page).toContain("markFeedbackRepliesRead");
    expect(read("src/components/nordic-icon/index.tsx")).toContain('"bell"');
  });
});
