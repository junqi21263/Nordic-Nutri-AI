import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { getFoodCategoryCode } from "../src/features/food-catalog/food-labels";
import en from "../src/i18n/locales/en.json";
import zhCN from "../src/i18n/locales/zh-CN.json";
import zhTW from "../src/i18n/locales/zh-TW.json";

it("maps stored and inferred Chinese category labels to stable display codes", () => {
  expect(getFoodCategoryCode("鱼虾海鲜")).toBe("seafood");
  expect(getFoodCategoryCode("乳制品")).toBe("dairy");
  expect(getFoodCategoryCode("其他")).toBe("other");
});

it("renders fallback and server taxonomy labels through stable translated codes", () => {
  const page = readFileSync(resolve(import.meta.dirname, "../src/pages/food-catalog/index.tsx"), "utf8");
  expect(page).toContain('t(`foodCatalog.categories.${chip.code}`');
  expect(page).toContain('t(`foodCatalog.tags.${tag.code}`');
  for (const locale of [en, zhCN, zhTW]) {
    expect(locale.foodCatalog.categories.seafood).toBeTruthy();
    expect(locale.foodCatalog.categories.all).toBeTruthy();
    expect(locale.foodCatalog.tags.high_protein).toBeTruthy();
  }
});
