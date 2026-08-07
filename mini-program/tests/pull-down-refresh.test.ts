import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("tab page pull-down refresh", () => {
  it("renders an animated three-dot indicator beneath the page title", () => {
    const layout = read("../src/layouts/page-layout/index.tsx");
    const componentStyles = read("../src/styles/components.scss");

    expect(layout).toContain("PullDownRefreshIndicator");
    expect(layout).toContain("refreshing");
    expect(componentStyles).toContain("pull-down-refresh__dot");
    expect(componentStyles).toContain("@keyframes pull-down-refresh-dot");
  });

  it.each([
    ["home", "首页"],
    ["meal-records", "记录页"],
    ["profile", "我的"],
  ])("enables pull-down refresh for %s", (page, label) => {
    const source = read(`../src/pages/${page}/index.tsx`);
    const config = read(`../src/pages/${page}/index.config.ts`);

    expect(source, label).toContain("usePullDownRefresh");
    expect(source, label).toContain("refreshing");
    expect(config, label).toContain("enablePullDownRefresh: true");
  });
});
