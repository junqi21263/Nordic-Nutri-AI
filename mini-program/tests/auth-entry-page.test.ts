import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");

describe("manual authentication entry", () => {
  it("registers a non-tab login entry with one-click WeChat login and default profile", () => {
    const appConfig = readFileSync(resolve(root, "app.config.ts"), "utf8");
    const page = readFileSync(resolve(root, "pages/auth-entry/index.tsx"), "utf8");

    expect(appConfig).toContain('"pages/auth-entry/index"');
    expect(appConfig.slice(appConfig.indexOf("tabBar:"))).not.toContain("pages/auth-entry/index");
    expect(page).toContain("loginWithWechat");
    expect(page).toContain("BottomSheet");
    expect(page).toContain("startApplicationAuth");
    expect(page).toContain("await startApplicationAuth()");
    expect(page).not.toContain('Taro.switchTab({ url: "/pages/home/index" })');
    expect(page).not.toContain("auth-entry-page__heading");
    expect(page).not.toContain("请登录以继续保存你的健康数据。");
    expect(page).toContain("微信一键登录");
    expect(page).toContain("默认头像与昵称会自动生成");
  });
});
