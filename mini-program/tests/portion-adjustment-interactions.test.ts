import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("份量调整交互", () => {
  it("提供餐名与热量同级的摘要，以及可直接跳转的份量档位", () => {
    const source = read("pages/portion-adjustment/index.tsx");

    expect(source).toContain('className="portion-summary__meal-title"');
    expect(source).toContain("const portionPresets = [25, 50, 75, 100, 125, 150, 175, 200]");
    expect(source).toContain("portion.adjustBy(-0.25)");
    expect(source).toContain("portion.adjustBy(0.25)");
    expect(source).toContain("portion.setMultiplier(percent / 100)");
    expect(source).toContain("恢复原始份量");
  });
});
