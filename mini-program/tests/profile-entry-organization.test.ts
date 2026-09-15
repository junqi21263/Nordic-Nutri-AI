import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("profile entry organization", () => {
  it("separates primary, support, sharing, and account actions", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/profile/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");

    expect(page).toContain("饮食管理");
    expect(page).toContain("帮助与信息");
    expect(page).toContain("推荐好友");
    expect(page).toContain("profile-rhythm__logout");
    expect(page).toContain('name="bookmark"');
    expect(page).toContain('name="message-circle"');
    expect(page).toContain('name="shield-check"');
    expect(page).toContain('name="info"');
    expect(page).toContain('name="log-out"');
    expect(page).not.toContain('name="pencil" size={20} ariaLabel="反馈与帮助"');
    expect(page).not.toContain('name="check" size={20} ariaLabel="隐私政策与免责声明"');
    expect(styles).toContain(".profile-rhythm__settings-section");
    expect(styles).toContain(".profile-rhythm__recommend-card");
    expect(styles).toContain(".profile-rhythm__logout");
  });
});
