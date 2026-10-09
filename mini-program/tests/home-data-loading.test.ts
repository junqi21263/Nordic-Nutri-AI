import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(import.meta.dirname, "../src/pages/home/index.tsx"), "utf8");

describe("首页远端数据加载门控", () => {
  it("在每日接口请求完成前不渲染本地 fixture 数据", () => {
    expect(home).toContain("const [homeDataReady, setHomeDataReady] = useState(false);");
    expect(home).toContain("if (!homeDataReady && !planSaveHandoffActive)");
    expect(home).toContain("if (cancelled) return;");
    expect(home).toContain("setHomeDataReady(true);");
    expect(home.indexOf("setHomeDataReady(true);")).toBeGreaterThan(home.indexOf("const request = getProductDailySummary(today)"));
  });
});
