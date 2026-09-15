import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("Android smart reminder settings", () => {
  it("has a registered settings page with the master and three meal controls", () => {
    expect(existsSync(resolve(root, "src/pages/smart-reminder-settings/index.tsx"))).toBe(true);
    const page = read("src/pages/smart-reminder-settings/index.tsx");
    expect(page).toContain('title="Nordic Nutri AI"');
    expect(page).toContain("smart-reminder-settings__intro-title");
    expect(page).toContain("记录提醒");
    expect(page).toContain("REMINDER_WINDOWS");
    expect(page).toContain('type: "breakfast"');
    expect(page).toContain('type: "lunch"');
    expect(page).toContain('type: "dinner"');
    expect(page).toContain("ReminderTimeSheet");
    expect(page).not.toContain('mode="time"');
    expect(page).toContain("isReminderTimeInWindow");
    expect(page).toContain("requestAndroidReminderPermission");
    expect(page).toContain("smart-reminder-settings__schedule-card");
    expect(page).toContain("smart-reminder-settings__meal-row");
    expect(page).toContain("showModal({");
    expect(page).not.toContain('variant: "success"');
    expect(page).toContain("ReminderAlarmModal");
    expect(page).toContain('icon: "reminder-sunrise"');
    expect(page).toContain('icon: "reminder-bowl"');
    expect(page).toContain('icon: "reminder-tray"');
    expect(page).not.toContain("smart-reminder-settings__capsule");
    expect(page).toContain("smart-reminder-settings__header-spacer");
    expect(page).toContain("smart-reminder-settings__hint-icon");
    expect(page).toContain("ReminderPausedModal");
  });

  it("uses the Stitch alarm animation for reminder feedback", () => {
    const component = read("src/components/reminder-alarm-modal/index.tsx");
    const styles = read("src/components/reminder-alarm-modal/index.scss");
    expect(component).toContain('<NordicIcon name="alarm-clock"');
    expect(component).not.toContain("mealIcons");
    expect(component).toContain("轻轻提醒你记录");
    expect(component).toContain("animate-alarm-wobble");
    expect(component).toContain("animate-ripple-1");
    expect(component).toContain("animate-ripple-2");
    expect(styles).toContain("@keyframes gentle-wobble");
    expect(styles).toContain("1.6s cubic-bezier(0.36, 0.07, 0.19, 0.97)");
    expect(styles).toContain("@keyframes subtle-ripple");
    expect(styles).toContain("2.4s cubic-bezier(0.2, 0.8, 0.4, 1)");
    expect(styles).toMatch(/\.animate-alarm-wobble\s*\{[\s\S]*?align-items: center;[\s\S]*?display: flex;[\s\S]*?justify-content: center;/);
  });

  it("uses an independent quieting animation when reminders are disabled", () => {
    const component = read("src/components/reminder-paused-modal/index.tsx");
    const styles = read("src/components/reminder-paused-modal/index.scss");
    const page = read("src/pages/smart-reminder-settings/index.tsx");
    expect(component).toContain('<NordicIcon name="bell-off"');
    expect(component).toContain("已关闭就餐提醒");
    expect(component).toContain("之后可以随时重新开启");
    expect(component).toContain("需要时，我们仍在这里。");
    expect(component).toContain("reminder-paused-modal__restart");
    expect(component).toContain("animate-quiet-bell");
    expect(component).toContain("animate-collapse-ring");
    expect(component).not.toContain("animate-alarm-wobble");
    expect(component).not.toContain("animate-ripple");
    expect(styles).toContain("@keyframes quiet-bell-settle");
    expect(styles).toContain("@keyframes collapse-ring");
    expect(styles).toMatch(/reminder-paused-modal__restart[\s\S]*?white-space: nowrap;/);
    expect(page).toContain("alarmFeedback?.enabled === false");
  });

  it("only exposes the time editor while the meal and master reminder are enabled", () => {
    const page = read("src/pages/smart-reminder-settings/index.tsx");
    const styles = read("src/pages/smart-reminder-settings/index.scss");
    expect(page).toContain("row?.enabled && settings?.enabled");
    expect(page).toContain("该餐次已关闭提醒");
    expect(page).toContain("smart-reminder-settings__closed-text");
    expect(styles).toMatch(/smart-reminder-settings__closed-text[\s\S]*?white-space: nowrap;/);
  });

  it("moves the completed-meal explanation into a collapsible schedule hint", () => {
    const page = read("src/pages/smart-reminder-settings/index.tsx");
    const styles = read("src/pages/smart-reminder-settings/index.scss");
    expect(page).toContain("scheduleInfoExpanded");
    expect(page).toContain("setScheduleInfoExpanded");
    expect(page).toContain("smart-reminder-settings__schedule-info-toggle");
    expect(page).toContain("ariaLabel={scheduleInfoExpanded ?");
    expect(page).toContain("smart-reminder-settings__schedule-info");
    expect(page).toContain("记录完成后，当天对应提醒会自动跳过。");
    expect(styles).toContain(".smart-reminder-settings__schedule-info--expanded");
    expect(styles).toContain("transform: rotate(225deg)");
  });

  it("keeps the schedule expand control beside its title", () => {
    const page = read("src/pages/smart-reminder-settings/index.tsx");
    const titleGroupIndex = page.indexOf("smart-reminder-settings__section-title-group");
    const toggleIndex = page.indexOf("smart-reminder-settings__schedule-info-toggle");
    const countIndex = page.indexOf("smart-reminder-settings__section-count");

    expect(titleGroupIndex).toBeGreaterThan(-1);
    expect(toggleIndex).toBeGreaterThan(titleGroupIndex);
    expect(countIndex).toBeGreaterThan(toggleIndex);
  });

  it("exposes the entry only in the Android profile layout", () => {
    const config = read("src/app.config.ts");
    const profile = read("src/pages/profile/index.tsx");
    expect(config).toContain('"pages/smart-reminder-settings/index"');
    expect(profile).toContain('process.env.TARO_APP_PLATFORM === "android"');
    expect(profile).toContain("记录提醒");
  });

  it("uses the Stitch-inspired light roller time picker contract", () => {
    const component = read("src/components/reminder-time-sheet/index.tsx");
    const styles = read("src/components/reminder-time-sheet/index.scss");
    expect(component).toContain("提醒时间");
    expect(component).toContain("适宜记录时间");
    expect(component).toContain("reminder-time-sheet__selector-card");
    expect(component).toContain("reminder-time-sheet__actions");
    expect(component).not.toContain("ScrollView");
    expect(styles).toContain("background: #f9faf7");
    expect(styles).toContain("border-radius: 28px 28px 0 0");
    expect(styles).toContain(".reminder-time-sheet__arrow");
    expect(styles).toContain("#1c3f32");
  });

  it("preserves Stitch CSS pixels inside the Android H5 px-transform build", () => {
    const styles = read("src/pages/smart-reminder-settings/index.scss");
    const sheetStyles = read("src/components/reminder-time-sheet/index.scss");
    const modalStyles = read("src/components/reminder-alarm-modal/index.scss");
    const page = read("src/pages/smart-reminder-settings/index.tsx");
    expect(page).toContain("smart-reminder-settings__screen");
    expect(page).toContain("smart-reminder-settings__intro");
    expect(styles).toContain("/*postcss-pxtransform disable*/");
    expect(sheetStyles).toContain("/*postcss-pxtransform disable*/");
    expect(modalStyles).toContain("/*postcss-pxtransform disable*/");
    expect(styles).toContain("padding: 24px 20px");
    expect(styles).toContain("font-size: 29px");
    expect(styles).toContain("font-size: 13.5px");
    expect(styles).toContain("padding: 12px 20px 8px");
    expect(styles).toMatch(/reminder-toggle--master[\s\S]*?height: 28px;[\s\S]*?width: 48px;/);
    expect(sheetStyles).toContain("border-radius: 28px 28px 0 0");
    expect(sheetStyles).toContain("font-size: 32px");
    expect(modalStyles).toContain("max-width: 340px");
    expect(modalStyles).toContain("height: 112px");
  });

  it("keeps each toggle thumb inside the Stitch-sized track", () => {
    const styles = read("src/pages/smart-reminder-settings/index.scss");

    expect(styles).toMatch(/\.reminder-toggle\s*\{[\s\S]*?border: 0;/);
    expect(styles).toMatch(/reminder-toggle--master[\s\S]*?height: 28px;[\s\S]*?width: 48px;/);
    expect(styles).toMatch(/reminder-toggle--master \.reminder-toggle__thumb[\s\S]*?height: 24px;[\s\S]*?width: 24px;/);
    expect(styles).toMatch(/reminder-toggle--meal[\s\S]*?height: 24px;[\s\S]*?width: 44px;/);
    expect(styles).toMatch(/reminder-toggle--meal \.reminder-toggle__thumb[\s\S]*?height: 20px;[\s\S]*?width: 20px;/);
  });

  it("slides the toggle thumb with the Stitch spring motion", () => {
    const styles = read("src/pages/smart-reminder-settings/index.scss");

    expect(styles).toMatch(/\.reminder-toggle__thumb\s*\{[\s\S]*?transition: transform 240ms cubic-bezier\(0\.34, 1\.4, 0\.64, 1\);/);
    expect(styles).toContain("transform: translateX(20px)");
  });
});
