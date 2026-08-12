import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(import.meta.dirname, "../src/pages/home/index.tsx"), "utf8");

describe("首页记录饮食入口", () => {
  it("只将记录饮食按钮导航到手动记录页", () => {
    const actionStart = home.indexOf('className="home-page__action" onClick={openManualMeal}');
    const action = home.slice(actionStart, actionStart + 260);

    expect(home).toContain('const openManualMeal = () => Taro.navigateTo({ url: "/pages/manual-meal/index" });');
    expect(actionStart).toBeGreaterThan(-1);
    expect(action).toContain("记录饮食");
    expect(action).not.toContain("openRecords");
  });
});
