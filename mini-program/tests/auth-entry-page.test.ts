import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");

describe("manual authentication entry", () => {
  it("registers a non-tab login entry that retries WeChat login only from an explicit action", () => {
    const appConfig = readFileSync(resolve(root, "app.config.ts"), "utf8");
    const page = readFileSync(resolve(root, "pages/auth-entry/index.tsx"), "utf8");

    expect(appConfig).toContain('"pages/auth-entry/index"');
    expect(appConfig.slice(appConfig.indexOf("tabBar:"))).not.toContain("pages/auth-entry/index");
    expect(page).toContain("loginWithWechat");
    expect(page).toContain('Taro.switchTab({ url: "/pages/home/index" })');
    expect(page).toContain("登录并开始使用");
  });
});
