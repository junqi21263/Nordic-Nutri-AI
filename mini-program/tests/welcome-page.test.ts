import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");

describe("first-time welcome page", () => {
  it("registers welcome as the first page with exit transition into auth routing", () => {
    const appConfig = readFileSync(resolve(root, "app.config.ts"), "utf8");
    const page = readFileSync(resolve(root, "pages/welcome/index.tsx"), "utf8");
    const styles = readFileSync(resolve(root, "styles/page.scss"), "utf8");
    const bootstrap = readFileSync(resolve(root, "auth/app-auth-bootstrap.ts"), "utf8");

    expect(appConfig.indexOf('"pages/welcome/index"')).toBeLessThan(
      appConfig.indexOf('"pages/auth-entry/index"'),
    );
    expect(page).toContain("开启健康之旅");
    expect(page).toContain("welcome-page--exiting");
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
    expect(styles).not.toContain(".welcome-page__kicker");
    expect(bootstrap).toContain("hasSeenWelcome");
    expect(bootstrap).toContain("openWelcome");
  });
});
