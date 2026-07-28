import { describe, expect, it } from "vitest";
import {
  CATEGORY_SEARCH_BY_CODE,
  CATEGORY_SEARCH_QUERIES,
  FOOD_CATEGORIES,
  STANDARD_FOOD_CATEGORY_ROOT_CODES,
  getFoodCategory,
  resolveCategorySearchQuery,
} from "../src/features/food-catalog/food-labels";

describe("category search coverage", () => {
  it("defines exactly twelve standard root categories", () => {
    expect(STANDARD_FOOD_CATEGORY_ROOT_CODES.size).toBe(12);
    expect([...STANDARD_FOOD_CATEGORY_ROOT_CODES]).toEqual([
      "meat_poultry", "seafood", "egg_dairy", "plant_protein", "grains_tubers", "vegetables",
      "fruits", "nuts_seeds", "oils_seasonings", "beverages", "basic_processed", "regional_staples",
    ]);
  });

  it("defines a USDA search query for every Chinese category except 全部", () => {
    for (const category of FOOD_CATEGORIES) {
      if (category === "全部") continue;
      expect(CATEGORY_SEARCH_QUERIES[category]?.length).toBeGreaterThan(2);
    }
  });

  it("defines matching queries for every server category code", () => {
    const codes = [
      "meat",
      "seafood",
      "egg",
      "dairy",
      "soy",
      "grain",
      "vegetable",
      "fruit",
      "beverage",
      "seasoning",
      "mixed_dish",
      "other",
    ];
    for (const code of codes) {
      expect(CATEGORY_SEARCH_BY_CODE[code]?.length).toBeGreaterThan(2);
    }
  });

  it("resolves by code preferentially", () => {
    expect(resolveCategorySearchQuery("肉禽", "seafood")).toBe(CATEGORY_SEARCH_BY_CODE.seafood);
    expect(resolveCategorySearchQuery("蛋类")).toBe(CATEGORY_SEARCH_QUERIES["蛋类"]);
    expect(resolveCategorySearchQuery("全部")).toBeNull();
  });

  it("classifies common foods into the expected categories", () => {
    const sample = (description: string) =>
      getFoodCategory({
        id: "1",
        source: "test",
        sourceFoodId: "1",
        description,
        brandName: null,
        dataType: null,
        category: null,
        servingSize: 100,
        servingUnit: "g",
        caloriesKcalPer100g: 100,
        proteinGPer100g: 10,
        carbsGPer100g: 10,
        fatGPer100g: 5,
        imageUrl: null,
        sourceUrl: null,
      });

    expect(sample("Chicken breast, cooked")).toBe("肉禽");
    expect(sample("Salmon, Atlantic, cooked")).toBe("鱼虾海鲜");
    expect(sample("Egg, whole, cooked")).toBe("蛋类");
    expect(sample("Eggplant, raw")).toBe("蔬菜");
    expect(sample("Greek yogurt, plain")).toBe("乳制品");
    expect(sample("Tofu, firm")).toBe("豆制品");
    expect(sample("Oatmeal, cooked")).toBe("谷物");
    expect(sample("Broccoli, cooked")).toBe("蔬菜");
    expect(sample("Banana, raw")).toBe("水果");
    expect(sample("Orange juice")).toBe("饮料");
    expect(sample("Olive oil")).toBe("调味品");
    expect(sample("Chicken stew")).toBe("肉禽");
    expect(sample("Chili")).toBe("混合菜");
    expect(sample("Almonds, raw")).toBe("其他");
  });
});
