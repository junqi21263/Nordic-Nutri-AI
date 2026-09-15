import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const worktreeRoot = resolve(import.meta.dirname, "../..");
const authPage = readFileSync(resolve(worktreeRoot, "mini-program/src/pages/android-auth/index.tsx"), "utf8");
const authComponents = readFileSync(resolve(worktreeRoot, "mini-program/src/pages/android-auth/auth-components.tsx"), "utf8");
const authStyles = readFileSync(resolve(worktreeRoot, "mini-program/src/pages/android-auth/index.scss"), "utf8");
const capacitorConfig = readFileSync(resolve(worktreeRoot, "capacitor.config.ts"), "utf8");
const androidStrings = readFileSync(resolve(worktreeRoot, "android/app/src/main/res/values/strings.xml"), "utf8");
const androidManifest = readFileSync(resolve(worktreeRoot, "android/app/src/main/AndroidManifest.xml"), "utf8");

describe("Android auth visual request", () => {
  it("keeps mainland China and the phone number in one fixed field", () => {
    expect(authPage.match(/\{renderTargetInput\(\)\}/g)).toHaveLength(3);
    expect(authPage).toContain("<PhoneInput value={phone} onChange={setPhone} />");
    expect(authPage).not.toContain("CountryPicker");
    expect(authPage).not.toContain("pickerOpen");
    expect(authComponents).toContain('<NordicIcon name="china" size={18} ariaLabel="中国" />');
    expect(authComponents).toContain(">+86<");
  });

  it("does not remount and animate the whole form when methods switch", () => {
    expect(authPage).not.toContain("key={view === \"google-connecting\" ? \"landing\" : view}");
    expect(authStyles).not.toContain("auth-view-enter");
    expect(authStyles).not.toContain(".auth-view { animation:");
  });

  it("uses the requested Android branding and shows more of the hero image", () => {
    expect(authComponents).toContain(">NORDIC-NUTRI<");
    expect(authStyles).toMatch(/\.auth-hero--compact\s*\{\s*height:\s*128PX;/);
    expect(authStyles).toContain(".auth-hero--compact .auth-hero__image");
    expect(capacitorConfig).toContain("appName: 'Nordic-Nutri-AI'");
    expect(androidStrings).toContain(">Nordic-Nutri-AI<");
    expect(androidManifest).toContain('@drawable/nordic_nutri_icon');
    expect(existsSync(resolve(worktreeRoot, "android/app/src/main/res/drawable-nodpi/nordic_nutri_icon.png"))).toBe(true);
  });
});
