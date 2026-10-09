import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import zhCN from "../src/i18n/locales/zh-CN.json";
import zhTW from "../src/i18n/locales/zh-TW.json";
import { getAchievementDisplayTitle } from "../src/features/coach/achievement-catalog";

const source = (path: string) =>
  readFileSync(resolve(import.meta.dirname, `../src/${path}`), "utf8");

describe("language settings page", () => {
  it("is registered and opened from Profile with a language icon", () => {
    expect(source("app.config.ts")).toContain('"pages/language-settings/index"');
    const entry = source("components/language-settings/index.tsx");
    expect(entry).toContain("/pages/language-settings/index");
    expect(entry).toContain('name="languages"');
  });

  it("keeps selection as a draft until explicit apply and supports reset", () => {
    const page = source("pages/language-settings/index.tsx");
    expect(page).toContain("useState<LanguagePreference>(getLanguagePreference)");
    expect(page).toContain('onClick={() => setPreference("system")}');
    expect(page).toContain("onClick={() => setPreference(key)}");
    expect(page).toMatch(/if \(preference !== getLanguagePreference\(\)\) \{\s*await setLanguagePreference\(preference\)/);
    expect(page).not.toContain("setLanguagePreference(key)");
    expect(page).toContain("Taro.navigateBack");
    expect(page).toContain("refreshAndroidSmartReminders");
    expect(page).toContain("syncSmartReminderSchedule");
    expect(page).toContain('t("languageSettings.apply")');
  });

  it("provides matching semantic page copy for all supported locales", () => {
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.languageSettings.title).toBeTruthy();
      expect(locale.languageSettings.introTitle).toBeTruthy();
      expect(locale.languageSettings.systemDescription).toContain("{{language}}");
      expect(locale.languageSettings.localeNames.zhCN).toBeTruthy();
      expect(locale.languageSettings.localeNames.zhTW).toBeTruthy();
      expect(locale.languageSettings.localeNames.en).toBeTruthy();
      expect(locale.languageSettings.info).toBeTruthy();
      expect(locale.languageSettings.apply).toBeTruthy();
      expect(locale.languageSettings.applyFailed).toBeTruthy();
    }
  });

  it("hides decorative section eyebrow and language count while retaining the accessible group label", () => {
    const page = source("pages/language-settings/index.tsx");
    expect(page).not.toContain('className="language-settings__eyebrow"');
    expect(page).not.toContain('className="language-settings__section-heading"');
    expect(page).not.toContain('className="language-settings__section-count"');
    expect(page).toContain('ariaLabel={t("languageSettings.availableLanguages")}');
  });
});

describe("profile achievement title localization", () => {
  it.each([
    ["第一餐记录", "firstMeal", "First meal"],
    ["早餐节奏", "breakfastRhythm", "Breakfast rhythm"],
  ])("localizes known achievement %s", (title, slug, expected) => {
    expect(
      getAchievementDisplayTitle(title, (key) => {
        expect(key).toBe(`achievements.items.${slug}.title`);
        return expected;
      }),
    ).toBe(expected);
  });

  it("preserves unknown API titles and is used in both profile layouts", () => {
    expect(getAchievementDisplayTitle("New server achievement", () => "translated")).toBe(
      "New server achievement",
    );
    for (const path of ["pages/profile/index.tsx", "pages/profile/android-overview.tsx"]) {
      const page = source(path);
      expect(page).toContain("getAchievementDisplayTitle");
    }
  });
});
