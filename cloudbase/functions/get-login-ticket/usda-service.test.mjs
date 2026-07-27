import assert from "node:assert/strict";
import test from "node:test";

import { createUsdaService, mapUsdaFood, scaleBrandedToPer100g } from "./usda-service.cjs";

const usdaFood = {
  fdcId: 12345,
  description: "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
  brandOwner: "USDA",
  dataType: "Foundation",
  foodCategory: "Poultry Products",
  servingSize: 100,
  servingSizeUnit: "g",
  foodNutrients: [
    { nutrientName: "Energy", unitName: "KCAL", value: 165 },
    { nutrientName: "Protein", unitName: "G", value: 31.02 },
    { nutrientName: "Carbohydrate, by difference", unitName: "G", value: 0 },
    { nutrientName: "Total lipid (fat)", unitName: "G", value: 3.57 },
    { nutrientName: "Fiber, total dietary", unitName: "G", value: 0 },
    { nutrientName: "Sodium, Na", unitName: "MG", value: 74 },
  ],
};

test("mapUsdaFood maps all unified nutrition fields and keeps raw payload", () => {
  const mapped = mapUsdaFood(usdaFood);
  assert.equal(mapped.source, "usda");
  assert.equal(mapped.sourceId, "12345");
  assert.equal(mapped.fdcId, 12345);
  assert.equal(mapped.calories, 165);
  assert.equal(mapped.protein_g, 31.02);
  assert.equal(mapped.carbs_g, 0);
  assert.equal(mapped.fat_g, 3.57);
  assert.equal(mapped.fiber_g, 0);
  assert.equal(mapped.sodium_mg, 74);
  assert.equal(mapped.sourceUrl, "https://fdc.nal.usda.gov/food-details/12345/nutrients");
  assert.equal(mapped.rawPayload, usdaFood);
});

test("prefers Energy in KCAL over kJ when both present", () => {
  const mapped = mapUsdaFood({
    ...usdaFood,
    fdcId: 99,
    foodNutrients: [
      { nutrientName: "Energy", unitName: "kJ", value: 545 },
      { nutrientName: "Energy", unitName: "KCAL", value: 130 },
      { nutrientName: "Protein", unitName: "G", value: 2.4 },
      { nutrientName: "Carbohydrate, by difference", unitName: "G", value: 28.2 },
      { nutrientName: "Total lipid (fat)", unitName: "G", value: 0.3 },
    ],
  });
  assert.equal(mapped.calories, 130);
});

test("converts kJ to kcal when only kJ is present", () => {
  const mapped = mapUsdaFood({
    ...usdaFood,
    fdcId: 77,
    foodNutrients: [
      { nutrientName: "Energy", unitName: "kJ", value: 418.4 },
      { nutrientName: "Protein", unitName: "G", value: 5 },
      { nutrientName: "Carbohydrate, by difference", unitName: "G", value: 10 },
      { nutrientName: "Total lipid (fat)", unitName: "G", value: 1 },
    ],
  });
  assert.equal(mapped.calories, 100);
});

test("scaleBrandedToPer100g scales branded serving nutrients", () => {
  assert.equal(scaleBrandedToPer100g(200, 50, "g", "Branded"), 400);
  // Foundation data is never scaled.
  assert.equal(scaleBrandedToPer100g(200, 50, "g", "Foundation"), 200);
  // Already per 100g.
  assert.equal(scaleBrandedToPer100g(165, 100, "g", "Branded"), 165);
  // Non-gram units are not scaled.
  assert.equal(scaleBrandedToPer100g(200, 1, "fl oz", "Branded"), 200);
});

test("createUsdaService rejects invalid queries and missing key", () => {
  assert.throws(() => createUsdaService({}), /USDA API key unavailable/);
  const svc = createUsdaService({ apiKey: "k" });
  assert.rejects(() => svc.search({ query: "a" }), /USDA_QUERY_INVALID/);
  assert.rejects(() => svc.getDetail("x"), /USDA_FDC_ID_INVALID/);
});

test("createUsdaService search maps foods via fetcher and returns totalHits", async () => {
  const svc = createUsdaService({
    apiKey: "k",
    fetcher: async (url) => {
      assert.match(url, /\/foods\/search\?/);
      assert.match(url, /api_key=k/);
      return { totalHits: 1, foods: [usdaFood] };
    },
  });
  const result = await svc.search({ query: "chicken", page: 1, pageSize: 5 });
  assert.equal(result.totalHits, 1);
  assert.equal(result.foods.length, 1);
  assert.equal(result.foods[0].sourceId, "12345");
});

test("pickBestNutritionMatch prefers Foundation over Branded", () => {
  const svc = createUsdaService({ apiKey: "k" });
  const best = svc.pickBestNutritionMatch([
    { dataType: "Branded", calories: 200, protein_g: 10 },
    { dataType: "Foundation", calories: 165, protein_g: 31 },
  ]);
  assert.equal(best.dataType, "Foundation");
});
