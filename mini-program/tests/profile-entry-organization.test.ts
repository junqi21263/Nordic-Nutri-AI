import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("profile entry organization", () => {
  it("separates primary, support, sharing, and account actions", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/profile/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");

    expect(page).toContain('t("profile.foodManagement")');
    expect(page).toContain('t("profile.helpInformation")');
    expect(page).not.toContain("和朋友一起");
    expect(page).not.toContain("推荐好友");
    expect(page).toContain("profile-rhythm__logout");
    expect(page).toContain('name="bookmark"');
    expect(page).toContain('name="message-circle"');
    expect(page).toContain('name="shield-check"');
    expect(page).toContain('name="info"');
    expect(page).toContain('name="log-out"');
    expect(page).not.toContain('name="pencil" size={20} ariaLabel="反馈与帮助"');
    expect(page).not.toContain('name="check" size={20} ariaLabel="隐私政策与免责声明"');
    expect(styles).toContain(".profile-rhythm__settings-section");
    expect(styles).toContain(".profile-rhythm__logout");
  });

  it("keeps version checking in My and legal links inside About us", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/profile/index.tsx"), "utf8");
    const component = readFileSync(resolve(sourceRoot, "components/language-settings/index.tsx"), "utf8");
    const helpGroup = page.match(
      /<Text className="profile-rhythm__settings-label">\{t\("profile\.helpInformation"\)\}<\/Text>\s*<View className="profile-rhythm__settings-group">([\s\S]*?)\n {12}<\/View>\n {10}<\/View>/,
    )?.[1] ?? "";

    expect(helpGroup).toContain('title={t("appUpdate.currentVersion", { version: androidVersionName || "—" })}');
    expect(helpGroup).toContain('description={checkingUpdate ? t("appUpdate.checking") : t("appUpdate.checkForUpdates")}');
    expect(helpGroup).not.toContain('title={t("profile.privacy")}');
    const aboutModal = page.split('open={activeModal === "about"}')[1] ?? "";
    expect(aboutModal).toContain('openLegalPage("/pages/privacy-policy/index")');
    expect(aboutModal).toContain('openLegalPage("/pages/terms-of-service/index")');
    expect(component).not.toContain("profile-rhythm__settings-section");
    expect(component).not.toContain('t("settings.title")');
  });
});
