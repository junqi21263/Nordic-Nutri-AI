import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../android/app/src/main");

describe("Android edge-to-edge system bars", () => {
  it("extends only the auth landing hero into the top system area", () => {
    const activity = readFileSync(resolve(root, "java/com/lewislee/nordicnutri/MainActivity.java"), "utf8");
    const auth = readFileSync(resolve(import.meta.dirname, "../src/pages/android-auth/index.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "../src/pages/android-auth/index.scss"), "utf8");
    expect(activity).toContain("authLandingVisible ? 0 : safeInsets.top");
    expect(auth).toContain('setAuthLandingVisible?.(view === "landing" || view === "google-connecting")');
    expect(auth).toContain("return () => insets?.setAuthLandingVisible?.(false)");
    expect(css).toMatch(/\.auth-provider-content\s*\{[^}]*gap: 4PX/);
  });
  it("removes bottom padding only while welcome is mounted and restores it on exit", () => {
    const activity = readFileSync(resolve(root, "java/com/lewislee/nordicnutri/MainActivity.java"), "utf8");
    const welcome = readFileSync(resolve(import.meta.dirname, "../src/pages/welcome/index.tsx"), "utf8");
    expect(activity).toContain("welcomeVisible ? 0 : safeInsets.bottom");
    expect(activity).toContain('new WelcomeInsetsBridge(), "NordicWelcomeInsets"');
    expect(welcome).toContain("insets?.setVisible(true)");
    expect(welcome).toMatch(/return \(\) => \{\s+insets\?\.setVisible\(false\)/);
  });

  it("keeps the welcome background visible behind both system bars", () => {
    const activity = readFileSync(resolve(root, "java/com/lewislee/nordicnutri/MainActivity.java"), "utf8");
    const styles = readFileSync(resolve(root, "res/values/styles.xml"), "utf8");
    const indexHtml = readFileSync(resolve(import.meta.dirname, "../src/index.html"), "utf8");
    const shareHook = readFileSync(resolve(import.meta.dirname, "../src/hooks/use-app-share.ts"), "utf8");

    expect(activity).toContain("getWindow().setStatusBarColor(Color.TRANSPARENT);");
    expect(activity).toContain("WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS");
    expect(styles).toContain('<item name="android:statusBarColor">@android:color/transparent</item>');
    expect(styles).toContain('<item name="android:navigationBarColor">@android:color/transparent</item>');
    expect(styles).toContain('<item name="android:windowLightNavigationBar">true</item>');
    expect(indexHtml).toContain("viewport-fit=cover");
    expect(shareHook).toContain("if (!isWeChatRuntime) return;");
  });

  it("uses a warm background without a launcher icon for the Android splash screen", () => {
    const styles = readFileSync(resolve(root, "res/values/styles.xml"), "utf8");

    expect(styles).toContain('<item name="windowSplashScreenBackground">#fbfaf7</item>');
    expect(styles).toContain('<item name="android:windowBackground">#fbfaf7</item>');
    expect(styles).toContain('<item name="windowSplashScreenAnimatedIcon">@drawable/splash_empty</item>');
  });
});
