import assert from "node:assert/strict";
import test from "node:test";

import { PublicFoodCatalogError, createFoodCatalogService, mapUsdaFood } from "./food-catalog-service.cjs";

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

test("validates the search query and page before consulting the cache", async () => {
  const service = createFoodCatalogService({
    cache: { search: async () => [], upsert: async () => [] },
    searchUsda: async () => [],
  });

  await assert.rejects(() => service.search("user-1", " ", 1), (error) => error instanceof PublicFoodCatalogError && error.code === "FOOD_QUERY_INVALID");
  await assert.rejects(() => service.search("user-1", "a", 1), (error) => error instanceof PublicFoodCatalogError && error.code === "FOOD_QUERY_INVALID");
  await assert.rejects(() => service.search("user-1", "chicken", 0), (error) => error instanceof PublicFoodCatalogError && error.code === "FOOD_PAGE_INVALID");
});

test("returns fresh cache results without calling USDA", async () => {
  let upstreamCalls = 0;
  const imageWrites = [];
  const cached = [{ id: "food-1", ...mapUsdaFood(usdaFood), synced_at: new Date().toISOString() }];
  const service = createFoodCatalogService({
    cache: { search: async () => cached, upsert: async (rows) => { imageWrites.push(rows); return rows.map((row) => ({ id: "food-1", ...row })); } },
    searchUsda: async () => { upstreamCalls += 1; return []; },
    searchImages: async () => [{ productName: "Chicken", imageUrl: "https://images.openfoodfacts.org/chicken.jpg" }],
    now: () => new Date("2026-07-22T00:00:00Z").getTime(),
  });

  const result = await service.search("user-1", "chicken", 1);
  assert.equal(upstreamCalls, 0);
  assert.equal(result.items[0].id, "food-1");
  assert.equal(result.items[0].proteinGPer100g, 31.02);
  assert.equal(result.items[0].imageUrl, "https://images.openfoodfacts.org/chicken.jpg");
  assert.equal(imageWrites.length, 1);
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

test("translates a Chinese food query before searching USDA and attaches an optional food image", async () => {
  const queries = [];
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
    searchImages: async (query) => {
      assert.equal(query, "beef");
      return [{ productName: "Beef", imageUrl: "https://images.openfoodfacts.org/beef.jpg" }];
    },
  });

  const result = await service.search("user-1", "牛肉", 1);

  assert.deepEqual(queries, ["beef"]);
  assert.equal(result.resolvedQuery, "beef");
  assert.equal(result.items[0].imageUrl, "https://images.openfoodfacts.org/beef.jpg");
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
