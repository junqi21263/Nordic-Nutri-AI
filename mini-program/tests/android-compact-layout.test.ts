import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const styles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");
const recordsPage = readFileSync(resolve(import.meta.dirname, "../src/pages/meal-records/index.tsx"), "utf8");
const profilePage = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");
const achievementDetail = readFileSync(resolve(import.meta.dirname, "../src/components/achievement-detail-sheet/index.tsx"), "utf8");
const achievementsPage = readFileSync(resolve(import.meta.dirname, "../src/pages/achievements/index.tsx"), "utf8");
const nordicIcon = readFileSync(resolve(import.meta.dirname, "../src/components/nordic-icon/index.tsx"), "utf8");
const coachPage = readFileSync(resolve(import.meta.dirname, "../src/pages/coach/index.tsx"), "utf8");
const profileEditPage = readFileSync(resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"), "utf8");
const manualMealPage = readFileSync(resolve(import.meta.dirname, "../src/pages/manual-meal/index.tsx"), "utf8");

it("keeps the home empty-state action compact", () => {
  const start = styles.indexOf(".page-layout--home-android .empty-state .app-button");
  expect(start).toBeGreaterThan(-1);
  expect(styles.slice(start, start + 220)).toContain("width: 40%");
  expect(styles.slice(start, start + 220)).toContain("max-width: 240PX");
});

it("places compact scanner overrides after the base frame rule", () => {
  const base = styles.indexOf(".food-scanner-page .scanner-frame {");
  const compact = styles.indexOf(".food-scanner-page.food-scanner-page--with-tip .scanner-frame");
  expect(compact).toBeGreaterThan(base);
  expect(styles.slice(compact, compact + 420)).toContain("height: min(460px, 31dvh)");
  expect(styles).toMatch(/\.page-layout--food-scanner-android \.page-layout__content\s*\{[^}]*padding-top: \$space-8/s);
});

it("keeps the Android meal-record empty-state action compact", () => {
  expect(recordsPage).toContain("page-layout--meal-records-android");
  const start = styles.indexOf(".page-layout--meal-records-android .empty-state .app-button");
  expect(start).toBeGreaterThan(-1);
  expect(styles.slice(start, start + 220)).toContain("width: 40%");
  expect(styles.slice(start, start + 220)).toContain("max-width: 220PX");
});

it("keeps the Android coach progress summary on one balanced row", () => {
  expect(coachPage).toContain('className="page-layout--coach-chat"');
  expect(coachPage).toContain('className="coach-chat__progress-copy"');
  expect(styles).toContain(".coach-chat__progress-copy");
  expect(styles).toContain("margin-right: 42px");
});

it("targets the rendered H5 form elements used by the Android shell", () => {
  expect(styles).toContain(".profile-form__summary > taro-view-core:last-child");
  expect(styles).toContain(".profile-form__field > taro-input-core");
  expect(styles).toContain(".profile-form__field > taro-input-core input");
  expect(styles).toContain(".profile-edit__notice > taro-view-core:last-child");
  const manualInput = styles.indexOf(".manual-meal__field input");
  expect(manualInput).toBeGreaterThan(-1);
  expect(styles.slice(manualInput, manualInput + 360)).toContain("line-height: 76px");
  expect(styles).toContain(".profile-form__input-row > taro-input-core");
  expect(styles).toContain(".manual-meal__field > taro-input-core");
  expect(profileEditPage).toContain('height: "100%", lineHeight: "normal", padding: 0');
  expect(manualMealPage).toContain('height: "100%", lineHeight: "normal", padding: 0');
});

it("matches the Android profile identity and achievement cards to the compact reference", () => {
  expect(profilePage).toContain("page-layout--profile-android");
  expect(profilePage).toContain('className="profile-hero__copy"');
  const hero = styles.indexOf(".page-layout--profile-android .profile-rhythm__identity");
  const achievements = styles.indexOf(".page-layout--profile-android .profile-rhythm__achievement");
  expect(hero).toBeGreaterThan(-1);
  expect(styles.slice(hero, hero + 320)).toContain("min-height: 108PX");
  expect(achievements).toBeGreaterThan(-1);
  expect(styles.slice(achievements, achievements + 220)).toContain("min-height: 72PX");
  expect(styles).toContain(".profile-rhythm__achievement .nordic-icon");
  expect(styles).toContain(".achievement-detail__badge .nordic-icon");
  expect(achievementDetail).toContain("achievement-detail-sheet--android");
  expect(achievementDetail).toContain("size={28}");
  expect(achievementsPage).toContain("size={20}");
  expect(profilePage).toContain("size={22}");
  expect(nordicIcon).toContain('isAndroidApp ? "scaleToFill" : "aspectFit"');
  expect(styles).not.toContain("translateX(-3PX)");
  expect(styles).toContain("margin: 0 auto");
  expect(profilePage).toContain('className="profile-rhythm__weekly-copy"');
  expect(profilePage).toContain('className="profile-rhythm__weekly-title"');
  expect(profilePage).toContain('className="profile-rhythm__weekly-description"');
  expect(profilePage).toContain('className="profile-rhythm__weekly-score-label"');
  expect(profilePage).toContain('className="profile-rhythm__weekly-score-value"');
  expect(profilePage).toContain('className="profile-rhythm__weekly-score-suffix"');
});
