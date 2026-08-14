import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("弹窗与 Toast 排他性", () => {
  it("在反馈底部弹窗关闭后使用统一成功弹窗而非成功 Toast", () => {
    const profile = read("pages/profile/index.tsx");

    expect(profile).toContain("feedback.showModal({");
    expect(profile).toContain("感谢你的反馈");
    expect(profile).toContain('dismissible: false');
    expect(profile).not.toContain('showNotice("感谢你的反馈")');
  });

  it("在删除确认弹窗关闭后才执行删除与 Toast 反馈", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const confirmIndex = detail.indexOf("onConfirm={() => {");
    const dismissIndex = detail.indexOf("setDeleteDialogOpen(false)", confirmIndex);
    const removeIndex = detail.indexOf("void remove()", confirmIndex);

    expect(confirmIndex).toBeGreaterThan(-1);
    expect(dismissIndex).toBeGreaterThan(confirmIndex);
    expect(removeIndex).toBeGreaterThan(dismissIndex);
  });
});
