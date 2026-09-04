import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const storage = new Map<string, unknown>();

vi.mock("@tarojs/taro", () => ({
  default: {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => {
      storage.set(key, value);
    },
    removeStorageSync: (key: string) => {
      storage.delete(key);
    },
  },
}));

describe("first-run tips", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("persists dismiss per tip id", async () => {
    const {
      hasSeenFirstRunTip,
      markFirstRunTipSeen,
      clearFirstRunTips,
    } = await import("../src/features/first-run-tips/first-run-tips");

    expect(hasSeenFirstRunTip("home-first-meal")).toBe(false);
    markFirstRunTipSeen("home-first-meal");
    expect(hasSeenFirstRunTip("home-first-meal")).toBe(true);
    expect(hasSeenFirstRunTip("scanner-capture")).toBe(false);
    clearFirstRunTips();
    expect(hasSeenFirstRunTip("home-first-meal")).toBe(false);
  });

  it("treats later steps as completing earlier tips", async () => {
    const { hasSeenFirstRunTip, markFirstRunTipSeen } = await import(
      "../src/features/first-run-tips/first-run-tips"
    );

    markFirstRunTipSeen("meal-records-review");
    expect(hasSeenFirstRunTip("home-first-meal")).toBe(true);
    expect(hasSeenFirstRunTip("scanner-capture")).toBe(true);
    expect(hasSeenFirstRunTip("meal-records-review")).toBe(true);
  });

  it("migrates legacy analysis-result-save storage key", async () => {
    storage.set(
      "nordic-nutri:first-run-tips:v1",
      JSON.stringify({ "analysis-result-save": true }),
    );
    const { hasSeenFirstRunTip } = await import("../src/features/first-run-tips/first-run-tips");
    expect(hasSeenFirstRunTip("meal-records-review")).toBe(true);
    expect(hasSeenFirstRunTip("scanner-capture")).toBe(true);
    expect(hasSeenFirstRunTip("home-first-meal")).toBe(true);
  });

  it("parses stringified storage payloads", async () => {
    storage.set(
      "nordic-nutri:first-run-tips:v1",
      JSON.stringify({ "scanner-capture": true }),
    );
    const { hasSeenFirstRunTip } = await import("../src/features/first-run-tips/first-run-tips");
    expect(hasSeenFirstRunTip("scanner-capture")).toBe(true);
    expect(hasSeenFirstRunTip("home-first-meal")).toBe(true);
  });

  it("retires tips when persisted meals are real (even if dataSource is still fixture)", async () => {
    const {
      hasSeenFirstRunTip,
      hasUserRecordedMeals,
      retireFirstRunTipsIfRecordedMeals,
    } = await import("../src/features/first-run-tips/first-run-tips");

    expect(hasUserRecordedMeals([{ id: "meal-breakfast-today" }], "fixture")).toBe(false);
    expect(
      hasUserRecordedMeals([{ id: "f25065e5-2034-45f1-a880-d9d35357a8b6" }], "fixture"),
    ).toBe(true);

    expect(
      retireFirstRunTipsIfRecordedMeals(
        [{ id: "f25065e5-2034-45f1-a880-d9d35357a8b6" }],
        "fixture",
      ),
    ).toBe(true);
    expect(hasSeenFirstRunTip("scanner-capture")).toBe(true);
  });

  it("wires the tip component into home, scanner, and meal records", () => {
    const home = readFileSync(resolve(import.meta.dirname, "../src/pages/home/index.tsx"), "utf8");
    const scanner = readFileSync(
      resolve(import.meta.dirname, "../src/pages/food-scanner/index.tsx"),
      "utf8",
    );
    const records = readFileSync(
      resolve(import.meta.dirname, "../src/pages/meal-records/index.tsx"),
      "utf8",
    );
    const result = readFileSync(
      resolve(import.meta.dirname, "../src/pages/analysis-result/index.tsx"),
      "utf8",
    );
    const clearLocal = readFileSync(
      resolve(import.meta.dirname, "../src/features/account-cancellation/clear-local-state.ts"),
      "utf8",
    );

    expect(home).toContain('tipId="home-first-meal"');
    expect(home).toContain("去拍照");
    expect(home).toContain("识别后还能改餐次和份量再保存");
    expect(home).not.toContain("AI 识别后还能改餐次和份量再保存");
    expect(home).toContain('markFirstRunTipSeen("home-first-meal")');
    expect(scanner).toContain('tipId="scanner-capture"');
    expect(scanner).toContain("开始拍摄");
    expect(scanner).toContain("dismissScannerTip");
    expect(scanner).toContain("retireFirstRunTipsIfRecordedMeals");
    expect(scanner).toContain("food-scanner-page--with-tip");
    expect(records).toContain('tipId="meal-records-review"');
    expect(records).toContain("3/3");
    expect(records).toContain("去添加");
    expect(records).toContain("/pages/manual-meal/index");
    expect(result).not.toContain("FirstRunTip");
    expect(clearLocal).toContain("clearFirstRunTips");
    expect(
      readFileSync(resolve(import.meta.dirname, "../src/components/first-run-tip/index.tsx"), "utf8"),
    ).toContain('dismissLabel = "知道了"');
  });
});
