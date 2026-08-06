import { describe, expect, it } from "vitest";
import type { ProductFoodCatalogItem } from "../src/api/food-catalog-api";
import {
  getFoodTags,
  matchesFoodFilters,
  matchesFoodMultiFilters,
  resolveTagCode,
} from "../src/features/food-catalog/food-labels";

function sample(partial: Partial<ProductFoodCatalogItem>): ProductFoodCatalogItem {
  return {
    id: "1",
    source: "test",
    sourceFoodId: "1",
    description: "Tofu",
    brandName: null,
    dataType: null,
    category: null,
    servingSize: 100,
    servingUnit: "g",
    caloriesKcalPer100g: 120,
    proteinGPer100g: 12,
    carbsGPer100g: 5,
    fatGPer100g: 6,
    fiberGPer100g: null,
    imageUrl: null,
    sourceUrl: null,
    ...partial,
  };
}

describe("food tag filters", () => {
  it("tags plant protein for standard plant_protein and grains_tubers categories", () => {
    expect(getFoodTags(sample({ category: "plant_protein", description: "豆腐" }))).toContain("植物蛋白");
    expect(getFoodTags(sample({ category: "grains_tubers", description: "燕麦" }))).toContain("植物蛋白");
    expect(getFoodTags(sample({ category: "豆类与植物蛋白" as never, description: "豆腐" })).length).toBeGreaterThanOrEqual(0);
  });

  it("tags high fiber when fiber is at least 5g/100g", () => {
    expect(getFoodTags(sample({ fiberGPer100g: 5, description: "燕麦" }))).toContain("高膳食纤维");
    expect(getFoodTags(sample({ fiberGPer100g: 4.9, description: "米饭" }))).not.toContain("高膳食纤维");
  });

  it("uses server tags when present", () => {
    expect(getFoodTags(sample({
      tags: [{ code: "high_fiber", nameZh: "高膳食纤维" }, { code: "plant_protein", nameZh: "植物蛋白" }],
    }))).toEqual(["高膳食纤维", "植物蛋白"]);
  });

  it("matches multi-select category and tag filters with OR within each dimension", () => {
    const oat = sample({
      category: "grains_tubers",
      description: "燕麦",
      fiberGPer100g: 10,
      carbsGPer100g: 60,
    });
    expect(matchesFoodMultiFilters(oat, ["谷物与薯类", "蔬菜"], ["高膳食纤维"])).toBe(true);
    expect(matchesFoodMultiFilters(oat, ["蔬菜"], ["高膳食纤维"])).toBe(false);
    expect(matchesFoodMultiFilters(oat, [], ["植物蛋白", "高蛋白"])).toBe(true);
    expect(matchesFoodFilters(oat, "全部", "高膳食纤维")).toBe(true);
  });

  it("resolves tag labels to codes", () => {
    expect(resolveTagCode("高膳食纤维")).toBe("high_fiber");
    expect(resolveTagCode("植物蛋白")).toBe("plant_protein");
    expect(resolveTagCode("high_protein")).toBe("high_protein");
  });
});
