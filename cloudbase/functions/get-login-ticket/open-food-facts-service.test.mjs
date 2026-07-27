import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenFoodFactsService,
  mapOpenFoodFactsProduct,
  parseServingGrams,
  pickFrontImage,
  scaleToPer100g,
} from "./open-food-facts-service.cjs";

const offProduct = {
  code: "5449000000996",
  product_name: "Coca Cola",
  brands: "Coca-Cola",
  categories: "Beverages",
  serving_size: "100 ml",
  serving_quantity: 100,
  nutriments: {
    "energy-kcal_100g": 42,
    proteins_100g: 0,
    carbohydrates_100g: 10.6,
    fat_100g: 0,
    sodium_100g: 4,
    sugars_100g: 10.6,
  },
  image_front_small_url: "https://images.openfoodfacts.org/images/front/5449000000996.3.100.jpg",
};

test("parseServingGrams extracts grams from serving_size", () => {
  assert.equal(parseServingGrams({ serving_size: "250 ml" }), 250);
  assert.equal(parseServingGrams({ serving_size: "1.5 g" }), 1.5);
  assert.equal(parseServingGrams({ serving_quantity: "200" }), 200);
  assert.equal(parseServingGrams({ serving_size: "1 slice" }), null);
});

test("scaleToPer100g scales by serving grams and leaves per-100g untouched", () => {
  assert.equal(scaleToPer100g(50, 50), 100);
  assert.equal(scaleToPer100g(100, 100), 100);
  assert.equal(scaleToPer100g(50, null), 50);
});

test("pickFrontImage prefers selected_images zh then en then small/front", () => {
  assert.equal(pickFrontImage({ selected_images: { front: { display: { zh: "zh-url" } } } }), "zh-url");
  assert.equal(pickFrontImage({ selected_images: { front: { display: { en: "en-url" } } } }), "en-url");
  assert.equal(pickFrontImage({ image_front_small_url: "small-url" }), "small-url");
  assert.equal(pickFrontImage({ image_front_url: "front-url" }), "front-url");
  assert.equal(pickFrontImage({ image_url: "url" }), "url");
  assert.equal(pickFrontImage({}), null);
});

test("mapOpenFoodFactsProduct builds a unified record with attribution and quality", () => {
  const mapped = mapOpenFoodFactsProduct(offProduct, "5449000000996");
  assert.equal(mapped.source, "open_food_facts");
  assert.equal(mapped.barcode, "5449000000996");
  assert.equal(mapped.calories, 42);
  assert.equal(mapped.protein_g, 0);
  assert.equal(mapped.carbs_g, 10.6);
  assert.equal(mapped.fat_g, 0);
  assert.equal(mapped.sodium_mg, 4);
  assert.equal(mapped.imageUrl, offProduct.image_front_small_url);
  assert.equal(mapped.license, "Open Food Facts (ODbL)");
  assert.ok(mapped.attribution.includes("Open Food Facts"));
  assert.ok(mapped.qualityScore >= 70);
  assert.equal(mapped.rawPayload, offProduct);
});

test("marks low quality when key nutrition missing", () => {
  const mapped = mapOpenFoodFactsProduct({
    code: "123",
    product_name: "Mystery",
    nutriments: { "energy-kcal_100g": 100 },
  }, "123");
  assert.ok(mapped.qualityScore <= 30);
});

test("rejects invalid barcodes", async () => {
  const svc = createOpenFoodFactsService({ fetcher: async () => ({ product: offProduct }) });
  await assert.rejects(() => svc.getByBarcode("abc"), /OFF_BARCODE_INVALID/);
  await assert.rejects(() => svc.getByBarcode("123"), /OFF_BARCODE_INVALID/);
});

test("getByBarcode calls fetcher with correct url and maps result", async () => {
  const svc = createOpenFoodFactsService({
    fetcher: async (url) => {
      assert.match(url, /\/api\/v2\/product\/5449000000996\.json/);
      return { product: offProduct };
    },
  });
  const result = await svc.getByBarcode("5449000000996");
  assert.equal(result.barcode, "5449000000996");
  assert.equal(result.calories, 42);
});
