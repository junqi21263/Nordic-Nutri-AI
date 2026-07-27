import assert from "node:assert/strict";
import test from "node:test";

import { PublicFoodCatalogError, createFoodCatalogService, mapUsdaFood, pickBestNutritionMatch } from "./food-catalog-service.cjs";

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
  ],
};

test("maps a USDA search result into the product food contract", () => {
  assert.deepEqual(mapUsdaFood(usdaFood), {
    source: "usda_fdc",
    sourceFoodId: "12345",
    description: usdaFood.description,
    brandName: "USDA",
    dataType: "Foundation",
    category: "Poultry Products",
    servingSize: 100,
    servingUnit: "g",
    caloriesKcalPer100g: 165,
    proteinGPer100g: 31.02,
    carbsGPer100g: 0,
    fatGPer100g: 3.57,
    imageUrl: null,
    sourceUrl: "https://fdc.nal.usda.gov/food-details/12345/nutrients",
  });
});

test("prefers Energy in KCAL over kJ when both are present", () => {
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
  assert.equal(mapped.caloriesKcalPer100g, 130);
});

test("converts branded per-serving nutrients to per-100g", () => {
  const mapped = mapUsdaFood({
    fdcId: 55,
    description: "Example Chili Sauce",
    brandOwner: "Acme",
    dataType: "Branded",
    foodCategory: "Sauces",
    servingSize: 10,
    servingSizeUnit: "g",
    foodNutrients: [
      { nutrientName: "Energy", unitName: "KCAL", value: 15 },
      { nutrientName: "Protein", unitName: "G", value: 0.2 },
      { nutrientName: "Carbohydrate, by difference", unitName: "G", value: 3 },
      { nutrientName: "Total lipid (fat)", unitName: "G", value: 0.1 },
    ],
  });
  assert.equal(mapped.caloriesKcalPer100g, 150);
  assert.equal(mapped.carbsGPer100g, 30);
});

test("prefers Foundation foods over Branded when looking up nutrition", () => {
  const best = pickBestNutritionMatch([
    { dataType: "Branded", caloriesKcalPer100g: 200, proteinGPer100g: 5, carbsGPer100g: 20, fatGPer100g: 8 },
    { dataType: "Foundation", caloriesKcalPer100g: 130, proteinGPer100g: 2.4, carbsGPer100g: 28, fatGPer100g: 0.3 },
  ]);
  assert.equal(best.dataType, "Foundation");
  assert.equal(best.caloriesKcalPer100g, 130);
});

test("validates the search query and page before consulting the cache", async () => {
  const service = createFoodCatalogService({
    cache: { search: async () => [], upsert: async () => [] },
    searchUsda: async () => [],
  });

  await assert.rejects(() => service.search("user-1", " ", 1), (error) => error instanceof PublicFoodCatalogError && error.code === "FOOD_QUERY_INVALID");
  await assert.rejects(() => service.search("user-1", "a", 1), (error) => error instanceof PublicFoodCatalogError && error.code === "FOOD_QUERY_INVALID");
  await assert.rejects(() => service.search("user-1", "chicken", 0), (error) => error instanceof PublicFoodCatalogError && error.code === "FOOD_PAGE_INVALID");
});

test("returns fresh cache results without calling USDA or Open Food Facts", async () => {
  let upstreamCalls = 0;
  let imageCalls = 0;
  const cached = [{ id: "food-1", ...mapUsdaFood(usdaFood), synced_at: new Date().toISOString() }];
  const service = createFoodCatalogService({
    cache: { search: async () => cached, upsert: async (rows) => rows.map((row) => ({ id: "food-1", ...row })) },
    searchUsda: async () => { upstreamCalls += 1; return []; },
    searchImages: async () => { imageCalls += 1; return [{ productName: "Chicken", imageUrl: "https://images.openfoodfacts.org/chicken.jpg" }]; },
    now: () => new Date("2026-07-22T00:00:00Z").getTime(),
  });

  const result = await service.search("user-1", "chicken", 1);
  assert.equal(upstreamCalls, 0);
  assert.equal(imageCalls, 0);
  assert.equal(result.items[0].id, "food-1");
  assert.equal(result.items[0].proteinGPer100g, 31.02);
  // No real-time OFF enrichment: cached nutrients are returned without an image url.
  assert.equal(result.items[0].imageUrl, null);
  assert.equal(result.source, "cache");
});

test("fetches USDA and persists a cacheable normalized result on a cache miss", async () => {
  const upserts = [];
  const service = createFoodCatalogService({
    cache: {
      search: async () => [],
      upsert: async (rows) => { upserts.push(rows); return rows.map((row, index) => ({ id: `food-${index + 1}`, ...row })); },
    },
    searchUsda: async (query, pageNumber) => {
      assert.equal(query, "chicken breast");
      assert.equal(pageNumber, 1);
      return [usdaFood];
    },
    searchImages: async () => [],
  });

  const result = await service.search("user-1", "chicken breast", 1);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0][0].source_food_id, "12345");
  assert.equal(result.source, "usda_fdc");
  assert.equal(result.items[0].description, usdaFood.description);
});

test("translates a Chinese food query before searching USDA (no real-time image enrichment)", async () => {
  const queries = [];
  let imageCalls = 0;
  const service = createFoodCatalogService({
    cache: { search: async () => [], upsert: async (rows) => rows.map((row) => ({ id: "food-1", ...row })) },
    translateQuery: async (query) => {
      assert.equal(query, "牛肉");
      return "beef";
    },
    searchUsda: async (query) => {
      queries.push(query);
      return [usdaFood];
    },
    searchImages: async () => { imageCalls += 1; return [{ productName: "Beef", imageUrl: "https://images.openfoodfacts.org/beef.jpg" }]; },
  });

  const result = await service.search("user-1", "牛肉", 1);

  assert.deepEqual(queries, ["beef"]);
  assert.equal(result.resolvedQuery, "beef");
  // Keyword-based OFF image enrichment is disabled on the search path.
  assert.equal(imageCalls, 0);
  assert.equal(result.items[0].imageUrl, null);
});

test("does not return USDA products without any usable nutrition values", async () => {
  const service = createFoodCatalogService({
    cache: { search: async () => [], upsert: async (rows) => rows.map((row) => ({ id: "food-unknown", ...row })) },
    searchUsda: async () => [{ fdcId: 9, description: "Unknown packaged food", foodNutrients: [] }],
    searchImages: async () => [],
  });

  const result = await service.search("user-1", "unknown", 1);

  assert.deepEqual(result.items, []);
});

test("returns a curated nutrition fallback when the upstream catalog is temporarily unavailable", async () => {
  const service = createFoodCatalogService({
    cache: { search: async () => [], upsert: async () => [] },
    translateQuery: async () => "salmon",
    searchUsda: async () => { throw new Error("USDA search timed out"); },
  });

  const result = await service.search("user-1", "三文鱼", 1);

  assert.equal(result.source, "fallback");
  assert.ok(result.items.length > 0);
  assert.match(result.items[0].description, /Salmon/i);
  assert.ok(result.items[0].proteinGPer100g > 0);
});

test("returns ten distinct discovery foods in a randomized order", async () => {
  const service = createFoodCatalogService({
    cache: { search: async () => [], upsert: async () => [] },
    searchUsda: async () => [],
    random: () => 0.5,
  });

  const result = await service.discover("user-1");

  assert.equal(result.items.length, 10);
  assert.equal(new Set(result.items.map((item) => item.id)).size, 10);
  assert.equal(result.source, "fallback");
});

test("supports a larger discovery limit for client-side catalog filters", async () => {
  const service = createFoodCatalogService({
    cache: { search: async () => [], upsert: async () => [] },
    searchUsda: async () => [],
    random: () => 0.5,
  });

  const result = await service.discover("user-1", 100);

  assert.equal(result.items.length, 36);
  assert.equal(new Set(result.items.map((item) => item.id)).size, 36);
});
