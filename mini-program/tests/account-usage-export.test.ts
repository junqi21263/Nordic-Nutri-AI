import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("account usage HTTPS boundary", () => {
  it("exposes usage helper without account export", () => {
    const api = readFileSync(resolve(sourceRoot, "api/product-data-api.ts"), "utf8");

    expect(api).toContain("getProductAccountUsage");
    expect(api).toContain('"/account/usage"');
    expect(api).toContain('method: "GET"');
    expect(api).toContain("ProductAccountUsage");
    expect(api).not.toContain("exportProductAccount");
    expect(api).not.toContain('"/account/export"');
  });

  it("shows low vision quota on the food scanner page", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-scanner/index.tsx"), "utf8");

    expect(page).toContain("getProductAccountUsage");
    expect(page).toContain("visionRemaining");
    expect(page).toContain("今日识别剩余");
    expect(page).toContain("usage-quota-tip");
  });

  it("blocks image picking with a clear daily-limit state while keeping a toast affordance", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-scanner/index.tsx"), "utf8");
    const button = readFileSync(resolve(sourceRoot, "components/app-button/index.tsx"), "utf8");

    expect(page).toContain("visionQuotaExhausted");
    expect(page).toContain("今日图片识别次数已用完");
    expect(page).toContain("请明天再试或手动记录");
    expect(page).toContain("visualDisabled={visionQuotaExhausted}");
    expect(page).toContain('presentation: "prominent"');
    expect(page).toContain("RATE_LIMITED");
    expect(button).toContain("visualDisabled");
  });

  it("shows low coach quota near the composer", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/coach/index.tsx"), "utf8");

    expect(page).toContain("dailyUsage.remaining <= 3");
    expect(page).toContain("今日教练对话剩余");
    expect(page).toContain("usage-quota-tip");
  });

  it("does not expose data export from the profile page", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/profile/index.tsx"), "utf8");

    expect(page).not.toContain("exportProductAccount");
    expect(page).not.toContain("导出我的数据");
    expect(page).not.toContain('activeModal === "privacy"');
    expect(page).toContain('openPage("/pages/privacy-policy/index")');
  });
});
