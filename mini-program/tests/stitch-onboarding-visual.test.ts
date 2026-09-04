import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const readSource = (relativePath: string) =>
  readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("Stitch onboarding visual contract", () => {
  const onboardingSource = readSource("src/pages/onboarding/index.tsx");
  const layoutSource = readSource("src/layouts/page-layout/index.tsx");
  const tokenSource = readSource("src/styles/tokens.scss");
  const zhCnSource = readSource("src/locales/zh-CN.ts");

  it("uses localized Stitch copy and a vertical goal-card structure", () => {
    [
      "你的目标是什么？",
      "我们将根据你的目标，为你制定个性化营养计划。",
      "增益增肌",
      "轻盈减脂",
      "保持状态",
      "健康饮食",
    ].forEach((label) => {
      expect(zhCnSource).toContain(label);
    });
    expect(onboardingSource).toContain("getLocaleMessages");
    expect(onboardingSource).toContain("onboarding-goal-list");
    expect(onboardingSource).toContain("BottomActionLayout");
    expect(onboardingSource).not.toContain("goal-grid");
    expect(onboardingSource).not.toContain("找到你的节奏");
    expect(onboardingSource).not.toContain("训练习惯");
    expect(onboardingSource).not.toContain("onboarding-hero__number");
  });

  it("uses native page scrolling instead of a fixed-height ScrollView", () => {
    expect(layoutSource).not.toContain("ScrollView");
    expect(layoutSource).toContain("hideNavigation");
  });

  it("uses the warm Stitch palette and the system font stack", () => {
    expect(tokenSource).toContain("$color-forest-green: #163422;");
    expect(tokenSource).toContain("$color-dark-forest: #0c1f14;");
    expect(tokenSource).toContain("$color-primary-container: #2d4b37;");
    expect(tokenSource).toContain("$color-warm-white: #faf9f6;");
    expect(tokenSource).toMatch(/-apple-system,\s*"Helvetica Neue",\s*"PingFang SC"/);
  });
});
