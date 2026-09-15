import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");

describe("first-time welcome page", () => {
  it("restores Android sessions after the welcome delay instead of forcing login", () => {
    const page = readFileSync(resolve(root, "pages/welcome/index.tsx"), "utf8");
    const timer = page.slice(page.indexOf("const navigationTimer"), page.indexOf("return () =>"));
    expect(timer).toContain("markWelcomeSeen()");
    expect(timer).toContain("startApplicationAuth({ force: true, allowSilentLogin: false })");
    expect(timer).toContain("3000 + EXIT_MS");
    expect(timer).not.toContain("/pages/android-auth/index");
    expect(timer).not.toContain("clearInvalidSession");
  });
  it("registers welcome as the first page with exit transition into auth routing", () => {
    const appConfig = readFileSync(resolve(root, "app.config.ts"), "utf8");
    const page = readFileSync(resolve(root, "pages/welcome/index.tsx"), "utf8");
    const styles = readFileSync(resolve(root, "styles/page.scss"), "utf8");
    const authStyles = readFileSync(resolve(root, "pages/android-auth/index.scss"), "utf8");
    const bootstrap = readFileSync(resolve(root, "auth/app-auth-bootstrap.ts"), "utf8");

    expect(appConfig.indexOf('"pages/welcome/index"')).toBeLessThan(
      appConfig.indexOf('"pages/auth-entry/index"'),
    );
    expect(page).toContain("开启健康之旅");
    expect(page).toContain("welcome-page--exiting");
    expect(page).toContain("welcome-page--android");
    expect(page).toContain("welcome-page__hero--android");
    expect(page).toContain("welcome-page__panel");
    expect(page).toContain("NordicIcon");
    expect(page).toContain("backgroundImage");
    expect(page).toContain('mode="aspectFill"');
    expect(page).toContain("markWelcomeSeen");
    expect(page).toContain("startApplicationAuth");
    expect(page).toContain("拍一餐，营养心中有数");
    expect(page).toContain("读懂餐盘里的食材与热量");
    expect(page).toContain("陪你慢慢养成好习惯");
    expect(page).toContain('{"\\n"}');
    expect(page).not.toContain("看清今天吃得怎么样");
    expect(page).not.toContain("已有账号，去登录");
    expect(page).not.toContain("welcome-page__kicker");
    expect(styles).toContain(".welcome-page--exiting");
    expect(styles).toContain("margin-top: 2vh");
    expect(styles).toContain(".welcome-page--android");
    expect(styles).toContain("background-size: cover");
    expect(styles).toContain(".welcome-page__panel");
    expect(styles).toContain(".welcome-page--android .welcome-page__panel");
    expect(styles).not.toContain('font-family: "Avenir Next", "Inter", "Roboto"');
    expect(styles).toContain(".welcome-page--exiting .welcome-page__hero");
    expect(styles).toContain(".welcome-page--exiting .welcome-page__brand");
    expect(styles).toContain(".welcome-page--exiting .welcome-page__subtitle");
    expect(styles).toMatch(
      /\.welcome-page--android\s*\{[\s\S]*?\.welcome-page__subtitle\s*\{[\s\S]*?max-width: none;/,
    );
    expect(styles).toMatch(/\.welcome-page--android\s*\{[\s\S]*?\.welcome-page__body\s*\{[\s\S]*?position: static;/);
    expect(styles).toMatch(
      /\.welcome-page--android\s*\{[\s\S]*?\.welcome-page__copy\s*\{[\s\S]*?margin-top: 0;/,
    );
    expect(styles).not.toContain(".welcome-page__kicker");
    expect(authStyles).toContain("animation: auth-page-enter");
    expect(authStyles).toContain("@keyframes auth-page-enter");
    expect(authStyles).toContain("prefers-reduced-motion: reduce");
    expect(bootstrap).toContain("hasSeenWelcome");
    expect(bootstrap).toContain("openWelcome");
  });
});
